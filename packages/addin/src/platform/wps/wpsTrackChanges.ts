import type { ITrackChangesManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsTrackChangesManager implements ITrackChangesManager {
    private tryBuildClauseRange(
        doc: any,
        info: { start: number; end: number },
        suggestedText: string
    ): { start: number; end: number } | null {
        const heading = (suggestedText || '').trim().match(/^\s*(第[\u4e00-\u9fa5\d]+条)/)?.[1];
        if (!heading) return null;

        const fullText = (doc?.Content?.Text as string) || '';
        if (!fullText) return null;

        const nearStart = Math.max(0, info.start - 800);
        const nearEnd = Math.min(fullText.length, info.end + 2400);
        const nearText = fullText.slice(nearStart, nearEnd);

        let clauseStart = -1;
        const nearIdx = nearText.indexOf(heading);
        if (nearIdx !== -1) {
            clauseStart = nearStart + nearIdx;
        } else {
            const globalIdx = fullText.indexOf(heading);
            if (globalIdx === -1) return null;
            if (Math.abs(globalIdx - info.start) > 3200) return null;
            clauseStart = globalIdx;
        }

        if (clauseStart < 0) return null;

        const tail = fullText.slice(clauseStart + heading.length);
        const nextHeading = tail.match(/\r\s*第[\u4e00-\u9fa5\d]+条/);
        const clauseEnd = nextHeading
            ? clauseStart + heading.length + (nextHeading.index ?? 0)
            : fullText.length;

        if (clauseEnd <= clauseStart + heading.length) return null;
        return { start: clauseStart, end: clauseEnd };
    }

    public async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number; end: number };
        const clauseRange = this.tryBuildClauseRange(doc, info, suggestedText);
        const target = clauseRange
            ? doc.Range(clauseRange.start, clauseRange.end)
            : doc.Range(info.start, info.end);

        const originalTrackMode = doc.TrackRevisions;
        try {
            doc.TrackRevisions = true;
            target.Text = suggestedText;
        } finally {
            doc.TrackRevisions = originalTrackMode;
        }
    }

    public async applyBatchSuggestedEdits(
        edits: Array<{ range: PlatformRange; suggestedText: string }>
    ): Promise<boolean[]> {
        if (!window.wps) return edits.map(() => false);
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;
        const originalTrackMode = doc.TrackRevisions;
        const results: boolean[] = [];

        try {
            doc.TrackRevisions = true;
            for (const edit of edits) {
                if (edit.range._platform !== 'wps') {
                    results.push(false);
                    continue;
                }
                try {
                    const info = edit.range._internal as { start: number; end: number };
                    const r = doc.Range(info.start, info.end);
                    r.Text = edit.suggestedText;
                    results.push(true);
                } catch {
                    results.push(false);
                }
            }
        } finally {
            doc.TrackRevisions = originalTrackMode;
        }

        return results;
    }

    public async insertAfterRange(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number; end: number };
        const r = doc.Range(info.end, info.end);

        const originalTrackMode = doc.TrackRevisions;
        try {
            doc.TrackRevisions = true;
            r.Text = '\n' + suggestedText;
        } finally {
            doc.TrackRevisions = originalTrackMode;
        }
    }

    public async revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number; end: number };
        const originalTrackMode = doc.TrackRevisions;

        try {
            // Prevent generating new revisions during undo.
            doc.TrackRevisions = false;

            const maxTextLen = Math.max(originalText?.length || 0, suggestedText?.length || 0, 200);
            const startPos = Math.max(0, info.start - 50);
            const endPos = info.end + maxTextLen + 100;

            let docEnd: number;
            try {
                docEnd = doc.Content.End || 999999;
            } catch {
                docEnd = 999999;
            }

            const scanRange = doc.Range(startPos, Math.min(endPos, docEnd));
            let revisions = scanRange.Revisions;
            let count = revisions ? revisions.Count : 0;

            if (count > 0) {
                for (let i = count; i >= 1; i--) {
                    try {
                        const rev = revisions.Item(i);
                        if (rev) rev.Reject();
                    } catch {
                        // keep trying other revisions
                    }
                }

                // Verify if any residual revisions remain in this area.
                revisions = scanRange.Revisions;
                count = revisions ? revisions.Count : 0;
                if (count > 0) {
                    try {
                        if (typeof revisions.RejectAll === 'function') {
                            revisions.RejectAll();
                        } else {
                            for (let i = count; i >= 1; i--) {
                                const rev = revisions.Item(i);
                                if (rev) rev.Reject();
                            }
                        }
                    } catch {
                        // ignore and continue to hard reset fallback
                    }
                }

                // Re-check again; if still not clean, hard reset the exact range text.
                revisions = scanRange.Revisions;
                count = revisions ? revisions.Count : 0;
                if (count === 0) return;
            }

            const hardResetRange = doc.Range(info.start, info.end);
            hardResetRange.Text = originalText;
        } catch (e) {
            console.error('[WPS revertEdit] failed:', e);
            throw e;
        } finally {
            doc.TrackRevisions = originalTrackMode;
        }
    }
}
