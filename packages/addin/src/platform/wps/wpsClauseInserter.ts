import type { IClauseInserter } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsClauseInserter implements IClauseInserter {
    public async insertTextAtSelection(content: string): Promise<void> {
        if (!window.wps) return;
        const app = window.wps.WpsApplication();
        const selection = app.Selection;

        selection.Text = content;
        // 向前扩展选区以覆盖刚插入的文本
        const endPos = selection.Range.End;
        const startPos = endPos - content.length;
        const newRange = app.ActiveDocument.Content;
        newRange.Start = startPos;
        newRange.End = endPos;
        newRange.Select();
    }
}
