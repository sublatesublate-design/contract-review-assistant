import type { ITrackChangesManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsTrackChangesManager implements ITrackChangesManager {
    public async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number; end: number };
        const r = doc.Range(info.start, info.end);

        const originalTrackMode = doc.TrackRevisions;
        try {
            doc.TrackRevisions = true;
            r.Text = suggestedText;
        } finally {
            doc.TrackRevisions = originalTrackMode;
        }
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
