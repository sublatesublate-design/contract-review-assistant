import type { ITrackChangesManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsTrackChangesManager implements ITrackChangesManager {
    public async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };
        const r = doc.Range(info.start, info.end);

        const originalTrackMode = doc.TrackRevisions;
        doc.TrackRevisions = true;
        r.Text = suggestedText;
        doc.TrackRevisions = originalTrackMode;
    }

    public async insertAfterRange(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };
        const r = doc.Range(info.end, info.end);

        const originalTrackMode = doc.TrackRevisions;
        doc.TrackRevisions = true;
        r.Text = '\n' + suggestedText;
        doc.TrackRevisions = originalTrackMode;
    }

    public async revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };

        // ── 策略：在足够宽的范围内 RejectAll ──
        // 当 applySuggestedEdit 执行后，WPS 在 [info.start, ...] 范围内会产生：
        //   - 一个「删除修订」(Deletion)：覆盖 originalText
        //   - 一个「插入修订」(Insertion)：覆盖 suggestedText
        // 这两个修订可能在不同的偏移位置，因此我们需要扩展搜索范围。
        try {
            const maxTextLen = Math.max(
                originalText ? originalText.length : 0,
                suggestedText ? suggestedText.length : 0,
                100
            );

            // 向前和向后各扩展一段缓冲区
            const startPos = Math.max(0, info.start - 30);
            const endPos = info.end + maxTextLen + 50;

            // 限制 endPos 不超过文档末尾
            let docEnd: number;
            try {
                docEnd = doc.Content.End || 999999;
            } catch {
                docEnd = 999999;
            }

            const r = doc.Range(startPos, Math.min(endPos, docEnd));
            const revisions = r.Revisions;

            if (revisions && revisions.Count > 0) {
                // 直接拒绝该范围内的所有修订——这是最可靠的方法
                // 因为 applySuggestedEdit 产生的修订一定在这个范围内
                revisions.RejectAll();
                console.log(`[WPS revertEdit] RejectAll 成功，范围 [${startPos}, ${Math.min(endPos, docEnd)}]`);
                return;
            }
        } catch (e) {
            console.error('[WPS revertEdit] RejectAll failed, fallback to text replace:', e);
        }

        // 兜底：直接无痕替换（仅在无修订记录时触发）
        try {
            const r = doc.Range(info.start, info.end);
            const originalTrackMode = doc.TrackRevisions;
            doc.TrackRevisions = false;
            r.Text = originalText;
            doc.TrackRevisions = originalTrackMode;
        } catch (e) {
            console.error('[WPS revertEdit] Fallback text replacement failed:', e);
        }
    }
}
