import type { ITrackChangesManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsTrackChangesManager implements ITrackChangesManager {
    public async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };
        // 使用 doc.Range() 代替 doc.Content 以避免构建整个文档的 COM 对象
        const r = doc.Range(info.start, info.end);

        const originalTrackMode = doc.TrackRevisions;
        doc.TrackRevisions = true;  // 开启修订模式
        r.Text = suggestedText;     // 替换文本即刻成为修订痕迹
        doc.TrackRevisions = originalTrackMode; // 恢复之前的状态
    }

    public async insertAfterRange(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };
        const r = doc.Range(info.end, info.end);

        const originalTrackMode = doc.TrackRevisions;
        doc.TrackRevisions = true;  // 开启修订模式
        r.Text = '\n' + suggestedText; // 插入的新内容即刻成为修订痕迹
        doc.TrackRevisions = originalTrackMode; // 恢复之前的状态
    }

    public async revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };

        // 策略：拒绝与此次修订相关的所有 Revision 条目
        // 扩展查找范围以确保覆盖到关联的"删除修订"（位于实际替换文本之前或之后）
        try {
            const expandChars = Math.max(
                originalText ? originalText.length : 0,
                suggestedText ? suggestedText.length : 0,
                50
            ) + 80;

            const startPos = Math.max(0, info.start - expandChars);
            const endPos = Math.min(
                doc.Content.End || 999999,
                info.end + expandChars
            );

            const r = doc.Range(startPos, endPos);
            const revisions = r.Revisions;

            if (revisions && revisions.Count > 0) {
                let rejectedCount = 0;

                // 倒序遍历避免索引偏移
                for (let i = revisions.Count; i >= 1; i--) {
                    try {
                        const rev = revisions.Item(i);
                        // WPS 修订类型：1=插入(wdRevisionInsert), 2=删除(wdRevisionDelete)
                        const revType = rev.Type;
                        const revText = (rev.Range.Text || '').replace(/\s+/g, '');

                        // 对于「删除型修订」：revText 是被删掉的原文
                        // 对于「插入型修订」：revText 是新插入的文本
                        const orig = (originalText || '').replace(/\s+/g, '');
                        const sugg = (suggestedText || '').replace(/\s+/g, '');

                        let shouldReject = false;

                        if (revType === 2) {
                            // 删除修订：被删除的文本应该是 originalText 的一部分
                            shouldReject = revText.length >= 2 && (
                                orig.includes(revText) ||
                                revText.includes(orig)
                            );
                        } else if (revType === 1) {
                            // 插入修订：插入的文本应该是 suggestedText 的一部分
                            shouldReject = revText.length >= 2 && (
                                sugg.includes(revText) ||
                                revText.includes(sugg)
                            );
                        } else {
                            // 属性或格式修订：参与文本匹配判断
                            shouldReject = revText.length >= 2 && (
                                orig.includes(revText) || sugg.includes(revText) ||
                                revText.includes(orig) || revText.includes(sugg)
                            );
                        }

                        if (shouldReject) {
                            rev.Reject();
                            rejectedCount++;
                        }
                    } catch (err) {
                        console.warn('[WPS revertEdit] Reject single revision failed:', err);
                    }
                }

                if (rejectedCount > 0) {
                    console.log(`[WPS revertEdit] 成功拒绝 ${rejectedCount} 个修订`);
                    return;
                }

                // 兜底：精确匹配失败时，拒绝范围内的所有修订
                console.warn('[WPS revertEdit] 精确匹配失败，尝试兜底拒绝范围内所有修订');
                const fbStart = Math.max(0, info.start - 20);
                const fbEnd = info.end + (suggestedText ? suggestedText.length : 0) + 20;
                const fallbackRange = doc.Range(fbStart, Math.min(doc.Content.End || 999999, fbEnd));
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
