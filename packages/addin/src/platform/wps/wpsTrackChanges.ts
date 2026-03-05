import type { ITrackChangesManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsTrackChangesManager implements ITrackChangesManager {
    public async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };
        const r = doc.Content;
        r.Start = info.start;
        r.End = info.end;

        const originalTrackMode = doc.TrackRevisions;
        doc.TrackRevisions = true;  // 开启修订模式
        r.Text = suggestedText;     // 替换文本即刻成为修订痕迹
        doc.TrackRevisions = originalTrackMode; // 恢复之前的状态
    }

    public async insertAfterRange(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument as any;

        const info = range._internal as { start: number, end: number };
        const r = doc.Range(info.end, info.end);

        const originalTrackMode = doc.TrackRevisions;
        doc.TrackRevisions = true;  // 开启修订模式
        r.Text = '\n' + suggestedText; // 插入的新内容即刻成为修订痕迹
        doc.TrackRevisions = originalTrackMode; // 恢复之前的状态
    }

    public async revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument as any;

        const info = range._internal as { start: number, end: number };

        // 策略：扩展选区范围以确保覆盖到可能在 info.start 之前产生的"删除修订"(Deletion Revision)
        try {
            const expandStart = originalText ? originalText.length + 50 : 50;
            const expandEnd = suggestedText ? suggestedText.length + 50 : 50;
            const startPos = Math.max(0, info.start - expandStart);
            const endPos = info.end + expandEnd;
            const r = doc.Range(startPos, endPos);

            const revisions = r.Revisions;
            if (revisions && revisions.Count > 0) {
                const orig = (originalText || '').replace(/\s+/g, '');
                const sugg = (suggestedText || '').replace(/\s+/g, '');

                let rejectedCount = 0;
                // 注意 VBA 集合索引从 1 开始，并且在遍历删除/拒绝时应当倒序遍历
                for (let i = revisions.Count; i >= 1; i--) {
                    try {
                        const rev = revisions.Item(i);
                        const revText = (rev.Range.Text || '').replace(/\s+/g, '');
                        if (revText && (
                            orig.includes(revText) ||
                            sugg.includes(revText) ||
                            revText.includes(orig) ||
                            revText.includes(sugg)
                        )) {
                            rev.Reject();
                            rejectedCount++;
                        }
                    } catch (err) {
                        console.warn('[WPS revertEdit] Reject single revision failed:', err);
                    }
                }

                if (rejectedCount > 0) return;

                // 如果精确匹配失败，兜底拒绝范围内的所有修订，但只缩小到建议文本的确切边界以避免误伤范围过大
                const fallbackRange = doc.Range(info.start, info.end + (suggestedText ? suggestedText.length : 0) + 10);
                if (fallbackRange.Revisions && fallbackRange.Revisions.Count > 0) {
                    fallbackRange.Revisions.RejectAll();
                    return;
                }
            }
        } catch (e) {
            console.error('[WPS revertEdit] Selective reject failed, fallback:', e);
        }

        // 兜底：直接无痕替换（仅在无修订记录时触发，避免叠加删除线）
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
