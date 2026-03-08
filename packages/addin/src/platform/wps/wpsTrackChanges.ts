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

        // ── 策略：在足够宽的范围内迭代 Reject ──
        // 当 applySuggestedEdit 执行后，WPS 在 [info.start, ...] 范围内会产生：
        //   - 一个「删除修订」(Deletion)：覆盖 originalText (从 info.start 开始)
        //   - 一个「插入修订」(Insertion)：覆盖 suggestedText (从 info.start 开始)
        const originalTrackMode = doc.TrackRevisions;
        try {
            // 撤销时关闭修订追踪，避免产生新的修订记录
            doc.TrackRevisions = false;

            const maxTextLen = Math.max(
                originalText ? originalText.length : 0,
                suggestedText ? suggestedText.length : 0,
                200 // 增加基础冗余
            );

            // 向前和向后各扩展缓冲区。向前扩展 50 字符以确保包含可能的段落标记或不可见锚点
            const startPos = Math.max(0, info.start - 50);
            const endPos = info.end + maxTextLen + 100;

            let docEnd: number;
            try {
                docEnd = doc.Content.End || 999999;
            } catch {
                docEnd = 999999;
            }

            const r = doc.Range(startPos, Math.min(endPos, docEnd));
            const revisions = r.Revisions;
            const count = revisions ? revisions.Count : 0;

            if (count > 0) {
                console.log(`[WPS revertEdit] 发现 ${count} 条修订，准备逐条拒绝...`);
                // 倒序遍历是操作集合时的标准做法，防止索引漂移
                for (let i = count; i >= 1; i--) {
                    try {
                        const rev = revisions.Item(i);
                        if (rev) {
                            rev.Reject();
                        }
                    } catch (revErr) {
                        console.warn(`[WPS revertEdit] 拒绝第 ${i} 条修订失败:`, revErr);
                    }
                }
                console.log(`[WPS revertEdit] 迭代拒绝完成，范围 [${startPos}, ${Math.min(endPos, docEnd)}]`);
                return;
            } else {
                console.log(`[WPS revertEdit] 范围内未发现修订，执行文本回退逻辑`);
            }
        } catch (e) {
            console.error('[WPS revertEdit] Iterative Reject failed, fallback to text replace:', e);
        } finally {
            doc.TrackRevisions = originalTrackMode;
        }

        // 兜底：直接无痕替换（仅在无修订记录时触发）
        try {
            const r = doc.Range(info.start, info.end);
            const trackMode = doc.TrackRevisions;
            doc.TrackRevisions = false;
            r.Text = originalText;
            doc.TrackRevisions = trackMode;
        } catch (e) {
            console.error('[WPS revertEdit] Fallback text replacement failed:', e);
        }
    }
}
