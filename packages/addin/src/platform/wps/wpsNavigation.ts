import type { INavigationHelper, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsNavigationHelper implements INavigationHelper {
    public async navigateToRange(range: PlatformRange): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const r = this.getWpsRange(range);
        r.Select(); // 选中该范围以实现跳转+高亮
    }

    public async highlightRange(range: PlatformRange, color?: string): Promise<void> {
        // WPS 中由于底色 HighlightColorIndex API 不稳定且无法取消，
        // 改为直接原生选中段落，体验更好
        if (!window.wps || range._platform !== 'wps') return;
        const r = this.getWpsRange(range);
        r.Select();
    }

    public async clearHighlight(range: PlatformRange): Promise<void> {
        // 由于改为了原生 Select 选中，取消选中只需要将光标折叠到末尾即可
        if (!window.wps || range._platform !== 'wps') return;
        try {
            const app = window.wps.WpsApplication();
            app.Selection.Collapse(window.wps.Enum?.wdCollapseEnd || 0);
        } catch (e) {
            console.error('WPS clearHighlight failed', e);
        }
    }

    public async navigateAndHighlight(range: PlatformRange): Promise<void> {
        // 直接选中即可，用户点击其他地方选中会自然消失
        await this.navigateToRange(range);
    }

    private getWpsRange(range: PlatformRange): _wps.Range {
        const app = window.wps!.WpsApplication() as any;
        const doc = app.ActiveDocument;
        const info = range._internal as { start: number, end: number };
        return doc.Range(info.start, info.end);
    }
}
