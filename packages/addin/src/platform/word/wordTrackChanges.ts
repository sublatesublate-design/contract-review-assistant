/* global Word */

import type { ITrackChangesManager, PlatformRange } from '../types';
import { resolveWordRange, type WordRangeRef } from './wordRangeMapper';

function normalizeForMatch(t: string): string {
    return (t || '').replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '');
}

function isTypeIncludes(typeValue: unknown, keyword: 'insert' | 'delete'): boolean {
    const s = String(typeValue ?? '').toLowerCase();
    return s.includes(keyword);
}

function isRevisionRelevant(
    revType: unknown,
    revText: string,
    normOrig: string,
    normSugg: string
): boolean {
    const normRev = normalizeForMatch(revText);
    const isInsert = isTypeIncludes(revType, 'insert') || revType === (Word as any).RevisionType?.insert;
    const isDelete = isTypeIncludes(revType, 'delete') || revType === (Word as any).RevisionType?.delete;

    if (!isInsert && !isDelete) return false;

    // Empty-text revisions (format/whitespace anchors) around target are still useful to reject.
    if (normRev.length === 0) return true;

    const safeContains = (a: string, b: string) => a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));

    if (isDelete && normOrig) {
        if (normRev === normOrig) return true;
        if (safeContains(normOrig, normRev)) return true;
    }
    if (isInsert && normSugg) {
        if (normRev === normSugg) return true;
        if (safeContains(normSugg, normRev)) return true;
    }

    return false;
}

async function rejectRevisionsInRange(
    context: Word.RequestContext,
    range: Word.Range,
    originalText: string,
    suggestedText?: string
): Promise<boolean> {
    const revisions = range.revisions;
    revisions.load('items');
    await context.sync();

    if (revisions.items.length === 0) return false;

    for (const rev of revisions.items) {
        (rev as any).load('type');
        const revRange = (rev as any).range;
        if (revRange) revRange.load('text');
    }
    await context.sync();

    const normOrig = normalizeForMatch(originalText);
    const normSugg = normalizeForMatch(suggestedText ?? '');

    let matchedReject = false;
    for (let i = revisions.items.length - 1; i >= 0; i--) {
        const rev = revisions.items[i];
        if (!rev) continue;

        let revText = '';
        let revType: unknown = '';
        try {
            revText = ((rev as any).range?.text as string) || '';
            revType = (rev as any).type;
        } catch {
            continue;
        }

        if (isRevisionRelevant(revType, revText, normOrig, normSugg)) {
            try {
                rev.reject();
                matchedReject = true;
            } catch {
                // ignore individual failure, keep trying others
            }
        }
    }

    if (matchedReject) {
        await context.sync();
        return true;
    }

    // Fallback: this range has revisions but none matched strongly; reject all in this local scope.
    try {
        revisions.rejectAll();
        await context.sync();
        return true;
    } catch {
        return false;
    }
}

export function createWordTrackChangesManager(): ITrackChangesManager {
    return {
        async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error('无法定位到文档中的原文');

                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                try {
                    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                    await context.sync();
                    wordRange.insertText(suggestedText, Word.InsertLocation.replace);
                    await context.sync();
                } finally {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                }
            });
        },

        async insertAfterRange(range: PlatformRange, suggestedText: string): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error('无法定位到文档中的插入锚点');

                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                try {
                    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                    await context.sync();
                    wordRange.insertText('\n' + suggestedText, Word.InsertLocation.after);
                    await context.sync();
                } finally {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                }
            });
        },

        async revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void> {
            const ref = range._internal as WordRangeRef;

            const reverted = await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) return false;

                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                let ok = false;
                try {
                    // Ensure reverting itself does not create new tracked changes.
                    doc.changeTrackingMode = Word.ChangeTrackingMode.off;
                    await context.sync();

                    // Range candidates from narrow to broad.
                    const candidates: Word.Range[] = [wordRange];
                    try {
                        const firstPara = wordRange.paragraphs.getFirst();
                        const lastPara = wordRange.paragraphs.getLast();
                        const paraRange = firstPara.getRange().expandTo(lastPara.getRange());
                        candidates.push(paraRange);

                        const prevPara = firstPara.getPreviousOrNullObject();
                        const nextPara = lastPara.getNextOrNullObject();
                        prevPara.load('isNullObject');
                        nextPara.load('isNullObject');
                        await context.sync();

                        const expandStart = prevPara.isNullObject ? firstPara.getRange() : prevPara.getRange();
                        const expandEnd = nextPara.isNullObject ? lastPara.getRange() : nextPara.getRange();
                        candidates.push(expandStart.expandTo(expandEnd));
                    } catch {
                        // ignore candidate expansion failure
                    }

                    for (const c of candidates) {
                        if (await rejectRevisionsInRange(context, c, originalText, suggestedText)) {
                            ok = true;
                            break;
                        }
                    }

                    // Global fallback: scan document revisions and reject relevant ones.
                    if (!ok) {
                        const all = context.document.body.getRange().revisions;
                        all.load('items');
                        await context.sync();

                        if (all.items.length > 0) {
                            for (const rev of all.items) {
                                (rev as any).load('type');
                                const rr = (rev as any).range;
                                if (rr) rr.load('text');
                            }
                            await context.sync();

                            const normOrig = normalizeForMatch(originalText);
                            const normSugg = normalizeForMatch(suggestedText ?? '');
                            let matched = false;
                            for (let i = all.items.length - 1; i >= 0; i--) {
                                const rev = all.items[i];
                                if (!rev) continue;
                                let revText = '';
                                let revType: unknown = '';
                                try {
                                    revText = ((rev as any).range?.text as string) || '';
                                    revType = (rev as any).type;
                                } catch {
                                    continue;
                                }
                                if (isRevisionRelevant(revType, revText, normOrig, normSugg)) {
                                    try {
                                        rev.reject();
                                        matched = true;
                                    } catch {
                                        // continue
                                    }
                                }
                            }
                            if (matched) {
                                await context.sync();
                                ok = true;
                            }
                        }
                    }

                    // Last fallback: hard reset the resolved range with tracking OFF.
                    if (!ok) {
                        wordRange.insertText(originalText, Word.InsertLocation.replace);
                        await context.sync();

                        const remained = wordRange.revisions;
                        remained.load('items');
                        await context.sync();
                        if (remained.items.length > 0) {
                            try {
                                remained.rejectAll();
                                await context.sync();
                            } catch {
                                // ignore
                            }
                        }
                        ok = true;
                    }
                } finally {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                }

                return ok;
            });

            if (!reverted) {
                throw new Error('无法自动取消修订，请手动在 Word 中拒绝此修订');
            }
        },
    };
}
