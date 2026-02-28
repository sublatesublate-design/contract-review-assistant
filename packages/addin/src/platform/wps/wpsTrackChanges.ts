import type { ITrackChangesManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsTrackChangesManager implements ITrackChangesManager {
    public async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument;

        const r = doc.Content;
        const info = range._internal as { start: number, end: number };
        r.Start = info.start;
        r.End = info.end;

        const originalTrackMode = doc.TrackRevisions;
        doc.TrackRevisions = true;  // 开启修订模式
        r.Text = suggestedText;     // 替换文本即刻成为修订痕迹
        doc.TrackRevisions = originalTrackMode; // 恢复之前的状态
    }
}
