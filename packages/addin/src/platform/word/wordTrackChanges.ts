/* global Word */

import type { ITrackChangesManager, PlatformRange } from '../types';
import { resolveWordRange, type WordRangeRef } from './wordRangeMapper';

// Keep replacement granularity consistent with AI prompt contract.
// 'full'  : replace the resolved originalText unit as a whole.
// 'minimal': shrink replacement range inside the resolved unit.
const WORD_REWRITE_MODE: 'full' | 'minimal' = 'full';

function normalizeForMatch(t: string): string {
    return (t || '').replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '');
}

function safeContains(a: string, b: string): boolean {
    return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}

function hasStrongOverlap(normRange: string, normTarget: string): boolean {
    if (!normRange || !normTarget) return false;
    if (safeContains(normRange, normTarget)) return true;
    if (normTarget.length >= 24) {
        const edge = Math.min(16, Math.floor(normTarget.length * 0.3));
        const head = normTarget.slice(0, edge);
        const tail = normTarget.slice(Math.max(0, normTarget.length - edge));
        return normRange.includes(head) && normRange.includes(tail);
    }
    return false;
}

function isLikelyTargetRangeText(rangeText: string, originalText: string, suggestedText?: string): boolean {
    const normRange = normalizeForMatch(rangeText);
    if (!normRange) return false;

    const normOrig = normalizeForMatch(originalText);
    const normSugg = normalizeForMatch(suggestedText ?? '');
    return hasStrongOverlap(normRange, normOrig) || hasStrongOverlap(normRange, normSugg);
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

    range.load('text');
    await context.sync();

    if (!isLikelyTargetRangeText(range.text || '', originalText, suggestedText)) {
        return false;
    }

    // Once local range is deemed reliable, reject all revisions in it to avoid residual marks.
    try {
        revisions.rejectAll();
        await context.sync();
        return true;
    } catch {
        return false;
    }
}

async function rejectAllRevisionsInRangeSafe(
    context: Word.RequestContext,
    range: Word.Range
): Promise<void> {
    try {
        const revisions = range.revisions;
        revisions.load('items');
        await context.sync();
        if (revisions.items.length > 0) {
            revisions.rejectAll();
            await context.sync();
        }
    } catch {
        // ignore cleanup failure
    }
}

async function rejectRelevantRevisionsInDocument(
    context: Word.RequestContext,
    originalText: string,
    suggestedText?: string
): Promise<boolean> {
    const all = context.document.body.getRange().revisions;
    all.load('items');
    await context.sync();

    if (all.items.length === 0) return false;

    const maxScan = 240;
    const pool = all.items.slice(Math.max(0, all.items.length - maxScan));

    for (const rev of pool) {
        (rev as any).load('type');
    }
    await context.sync();

    const normOrig = normalizeForMatch(originalText);
    const normSugg = normalizeForMatch(suggestedText ?? '');
    let matched = false;

    const textCandidates: Array<any> = [];
    for (const rev of pool) {
        const revType = (rev as any).type;
        const isInsert = isTypeIncludes(revType, 'insert') || revType === (Word as any).RevisionType?.insert;
        const isDelete = isTypeIncludes(revType, 'delete') || revType === (Word as any).RevisionType?.delete;
        if (!isInsert && !isDelete) continue;
        const rr = (rev as any).range;
        if (rr) {
            rr.load('text');
            textCandidates.push(rev);
        }
    }
    if (textCandidates.length === 0) return false;
    await context.sync();

    for (let i = textCandidates.length - 1; i >= 0; i--) {
        const rev = textCandidates[i];
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
        return true;
    }

    return false;
}

async function buildLengthAwareExpandedRange(
    context: Word.RequestContext,
    wordRange: Word.Range,
    originalText: string,
    suggestedText?: string
): Promise<Word.Range | null> {
    try {
        const targetLen = Math.max(
            normalizeForMatch(originalText).length,
            normalizeForMatch(suggestedText ?? '').length,
            1
        );
        if (targetLen < 24) return wordRange;

        let current = wordRange;
        current.load('text');
        await context.sync();
        let startPara = current.paragraphs.getFirst();
        let endPara = current.paragraphs.getLast();

        const maxExpandSteps = 2;
        for (let step = 0; step < maxExpandSteps; step++) {
            const currentLen = normalizeForMatch(current.text || '').length;
            if (currentLen >= Math.floor(targetLen * 0.92)) {
                break;
            }

            const prevPara = startPara.getPreviousOrNullObject();
            const nextPara = endPara.getNextOrNullObject();
            prevPara.load('isNullObject');
            nextPara.load('isNullObject');
            await context.sync();

            if (prevPara.isNullObject && nextPara.isNullObject) {
                break;
            }
            if (!prevPara.isNullObject) {
                startPara = prevPara;
            }
            if (!nextPara.isNullObject) {
                endPara = nextPara;
            }

            const expanded = startPara.getRange().expandTo(endPara.getRange());
            expanded.load('text');
            await context.sync();

            const expandedLen = normalizeForMatch(expanded.text || '').length;
            if (expandedLen > Math.max(targetLen * 3 + 120, 260)) {
                break;
            }
            current = expanded;
        }

        return current;
    } catch {
        return null;
    }
}

async function buildOneStepNeighborRange(
    context: Word.RequestContext,
    wordRange: Word.Range
): Promise<Word.Range | null> {
    try {
        const firstPara = wordRange.paragraphs.getFirst();
        const lastPara = wordRange.paragraphs.getLast();
        const prevPara = firstPara.getPreviousOrNullObject();
        const nextPara = lastPara.getNextOrNullObject();
        prevPara.load('isNullObject');
        nextPara.load('isNullObject');
        await context.sync();

        const start = prevPara.isNullObject ? firstPara.getRange() : prevPara.getRange();
        const end = nextPara.isNullObject ? lastPara.getRange() : nextPara.getRange();
        return start.expandTo(end);
    } catch {
        return null;
    }
}

function buildShrinkQueries(originalText: string): string[] {
    const oneLine = (originalText || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!oneLine) return [];

    const queries: string[] = [];
    if (oneLine.length <= 240) {
        queries.push(oneLine);
    } else {
        queries.push(oneLine.slice(0, 220));
        queries.push(oneLine.slice(Math.max(0, oneLine.length - 220)));
        const midWindow = 180;
        const midStart = Math.max(0, Math.floor(oneLine.length / 2) - Math.floor(midWindow / 2));
        queries.push(oneLine.slice(midStart, midStart + midWindow));
    }

    const heading = oneLine.match(/^\s*第\s*[\u4e00-\u9fa5\d]{1,12}\s*条(?:\s+[\u4e00-\u9fa5]{1,20})?/);
    if (heading?.[0]) {
        queries.push(heading[0].trim());
    }

    const noPunct = oneLine
        .replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (noPunct.length >= 16) {
        queries.push(noPunct.slice(0, 220));
    }

    const seen = new Set<string>();
    const out: string[] = [];
    for (const q of queries) {
        const s = q.trim();
        if (s.length < 6 || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}

async function tryShrinkReplaceRange(
    context: Word.RequestContext,
    baseRange: Word.Range,
    originalText: string
): Promise<Word.Range> {
    const targetNorm = normalizeForMatch(originalText || '');
    if (targetNorm.length < 12) return baseRange;

    baseRange.load('text');
    await context.sync();
    const baseNormLen = normalizeForMatch(baseRange.text || '').length;
    if (!baseNormLen) return baseRange;

    // Base range is already tight enough.
    if (baseNormLen <= Math.max(targetNorm.length + 8, Math.floor(targetNorm.length * 1.25))) {
        return baseRange;
    }

    const queries = buildShrinkQueries(originalText);
    if (queries.length === 0) return baseRange;

    let best: Word.Range | null = null;
    let bestScore = -Infinity;

    for (const query of queries.slice(0, 4)) {
        const hits = baseRange.search(query, {
            matchCase: false,
            matchWholeWord: false,
            ignoreSpace: true,
            ignorePunct: true,
        });
        hits.load('items');
        await context.sync();

        if (hits.items.length === 0) continue;
        const candidates = hits.items.slice(0, 6);
        for (const candidate of candidates) {
            candidate.load('text');
        }
        await context.sync();

        for (const candidate of candidates) {
            const text = candidate.text || '';
            const norm = normalizeForMatch(text);
            if (!norm) continue;

            const overlap =
                hasStrongOverlap(norm, targetNorm) ||
                safeContains(norm, targetNorm) ||
                safeContains(targetNorm, norm);
            if (!overlap) continue;

            const lenPenalty = Math.abs(norm.length - targetNorm.length) / Math.max(targetNorm.length, 1);
            const overshootPenalty = norm.length > targetNorm.length * 1.6 ? 0.9 : 0;
            const score =
                (safeContains(norm, targetNorm) ? 1.7 : 0) +
                (safeContains(targetNorm, norm) ? 1.0 : 0) +
                (hasStrongOverlap(norm, targetNorm) ? 1.2 : 0) -
                lenPenalty -
                overshootPenalty;

            if (score > bestScore) {
                bestScore = score;
                best = candidate;
            }
        }
    }

    if (!best) return baseRange;

    best.load('text');
    await context.sync();
    const bestNormLen = normalizeForMatch(best.text || '').length;
    if (!bestNormLen) return baseRange;
    if (bestNormLen >= baseNormLen) return baseRange;
    if (bestNormLen > Math.max(targetNorm.length * 1.45, targetNorm.length + 30)) return baseRange;

    return best;
}

export function createWordTrackChangesManager(): ITrackChangesManager {
    return {
        async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error('无法定位到文档中的原文');
                const replaceRange = WORD_REWRITE_MODE === 'minimal'
                    ? await tryShrinkReplaceRange(context, wordRange, ref.searchText || '')
                    : wordRange;

                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                try {
                    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                    replaceRange.insertText(suggestedText, Word.InsertLocation.replace);
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                } catch (err) {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                    throw err;
                }
            });
        },

        async applyBatchSuggestedEdits(
            edits: Array<{ range: PlatformRange; suggestedText: string }>
        ): Promise<boolean[]> {
            return Word.run(async (context) => {
                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;
                const results: boolean[] = [];

                try {
                    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                    await context.sync();

                    const stagedApplyIndexes: number[] = [];
                    for (const edit of edits) {
                        const ref = edit.range._internal as WordRangeRef;
                        const wordRange = await resolveWordRange(context, ref);
                        if (!wordRange) {
                            results.push(false);
                            continue;
                        }

                        try {
                            const replaceRange = WORD_REWRITE_MODE === 'minimal'
                                ? await tryShrinkReplaceRange(context, wordRange, ref.searchText || '')
                                : wordRange;
                            replaceRange.insertText(edit.suggestedText, Word.InsertLocation.replace);
                            stagedApplyIndexes.push(results.length);
                            results.push(true);
                        } catch {
                            results.push(false);
                        }
                    }

                    if (stagedApplyIndexes.length > 0) {
                        try {
                            await context.sync();
                        } catch {
                            for (const index of stagedApplyIndexes) {
                                results[index] = false;
                            }
                        }
                    }
                } finally {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                }

                return results;
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
                    wordRange.insertText('\n' + suggestedText, Word.InsertLocation.after);
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                } catch (err) {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                    throw err;
                }
            });
        },
        async revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void> {
            const ref = range._internal as WordRangeRef;

            const reverted = await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                let ok = false;
                let workingRange: Word.Range | null = null;
                let localLikely = false;
                try {
                    // Ensure reverting itself does not create new tracked changes.
                    doc.changeTrackingMode = Word.ChangeTrackingMode.off;
                    await context.sync();

                    // Range lookup can fail after user edits or index drift on Mac Word.
                    // In that case, fallback to a document-wide relevant revision scan.
                    if (!wordRange) {
                        ok = await rejectRelevantRevisionsInDocument(
                            context,
                            originalText,
                            suggestedText
                        );
                        return ok;
                    }

                    workingRange = await buildLengthAwareExpandedRange(
                        context,
                        wordRange,
                        originalText,
                        suggestedText
                    );
                    if (!workingRange) {
                        workingRange = wordRange;
                    }

                    workingRange.load('text');
                    await context.sync();
                    localLikely = isLikelyTargetRangeText(
                        workingRange.text || '',
                        originalText,
                        suggestedText
                    );

                    // Local fast-path: directly restore original text with tracking OFF, then cleanup nearby revisions.
                    if (localLikely) {
                        workingRange.insertText(originalText, Word.InsertLocation.replace);
                        await context.sync();
                        await rejectAllRevisionsInRangeSafe(context, workingRange);
                        const localNeighbor = await buildOneStepNeighborRange(context, workingRange);
                        if (localNeighbor) {
                            await rejectAllRevisionsInRangeSafe(context, localNeighbor);
                        }
                        ok = true;
                    } else {
                        // Conservative path when resolved range confidence is low.
                        ok = await rejectRevisionsInRange(
                            context,
                            wordRange,
                            originalText,
                            suggestedText
                        );
                        if (ok) {
                            await rejectAllRevisionsInRangeSafe(context, wordRange);
                            const localNeighbor = await buildOneStepNeighborRange(context, wordRange);
                            if (localNeighbor) {
                                await rejectAllRevisionsInRangeSafe(context, localNeighbor);
                            }
                        }
                    }

                    // Global fallback only when local paths fail.
                    if (!ok) {
                        ok = await rejectRelevantRevisionsInDocument(
                            context,
                            originalText,
                            suggestedText
                        );
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
