import type { INavigationHelper, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsNavigationHelper implements INavigationHelper {
    public async navigateToRange(range: PlatformRange): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const r = this.getWpsRange(range);
        r.Select(); // 选中该范围以实现跳转
    }

    public async highlightRange(range: PlatformRange, color?: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const r = this.getWpsRange(range);
        // WPS 使用 HighlightColorIndex 枚举值，7 代表黄色
        r.HighlightColorIndex = window.wps.Enum?.wdColorIndexYellow || 7;
    }

    public async clearHighlight(range: PlatformRange): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const r = this.getWpsRange(range);
        // 0 代表无高亮
        r.HighlightColorIndex = window.wps.Enum?.wdColorIndexNone || 0;
    }

    public async navigateAndHighlight(range: PlatformRange): Promise<void> {
        await this.navigateToRange(range);
        await this.highlightRange(range);
    }

    private getWpsRange(range: PlatformRange): _wps.Range {
        const app = window.wps!.WpsApplication();
        const r = app.ActiveDocument.Content;
        const info = range._internal as { start: number, end: number };
        r.Start = info.start;
        r.End = info.end;
        return r;
    }
}
