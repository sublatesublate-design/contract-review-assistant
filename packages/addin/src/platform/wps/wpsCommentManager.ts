import type { ICommentManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsCommentManager implements ICommentManager {
    public async addComment(range: PlatformRange, commentText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument;

        const r = doc.Content;
        const info = range._internal as { start: number, end: number };
        r.Start = info.start;
        r.End = info.end;

        doc.Comments.Add(r, commentText);
    }

    public async addBatchComments(comments: Array<{ range: PlatformRange; text: string }>): Promise<void> {
        for (const c of comments) {
            await this.addComment(c.range, c.text);
        }
    }
}
