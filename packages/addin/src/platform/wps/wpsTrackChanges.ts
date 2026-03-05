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

        // 最快策略：在精确范围上调用 RejectAll() 一次性拒绝所有修订，O(1) 级别
        // 扩展一点偏移以确保捕获到被删除的 originalText（修订后位置可能略有偏移）
        try {
            const r = doc.Range(info.start, info.end + (suggestedText ? suggestedText.length : 0) + 10);
            const revisions = r.Revisions;
            if (revisions && revisions.Count > 0) {
                revisions.RejectAll(); // 一次 API 调用，拒绝该范围内所有修订
                return;
            }
        } catch (e) {
            console.error('[WPS revertEdit] RejectAll failed, fallback:', e);
        }

        // 兜底：直接无痕替换（仅在无修订记录时触发，避免叠加删除线）
        try {
            const r = doc.Range(info.start, info.end);
            const originalTrackMode = doc.TrackRevisions;
            doc.TrackRevisions = false;
            r.Text = originalText;
            doc.TrackRevisions = originalTrackMode;
        } catch (e) {
            console.error('[WPS revertEdit] Fallback failed:', e);
        }
    }
}
