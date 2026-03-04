import type { IRangeMapper, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsRangeMapper implements IRangeMapper {
    public async findRange(originalText: string): Promise<PlatformRange | null> {
        if (!window.wps) return null;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        let searchText = originalText.trim();
        const searchPattern = searchText.replace(/\r?\n/g, '\r');

        try {
            // 1. 尝试全局全量字符串精确匹配 (最快且容错最高)
            const fullText = doc.Content.Text;
            if (fullText) {
                const idx = fullText.indexOf(searchPattern);
                if (idx !== -1) {
                    return { _internal: { start: idx, end: idx + searchPattern.length }, _platform: 'wps' };
                }
            }

            // 2. 长段落退化为精确查开头 (截取前50个字符，规避部分特殊符号截断问题)
            if (searchPattern.length > 50) {
                const prefix = searchPattern.substring(0, 50);
                if (fullText) {
                    const idx = fullText.indexOf(prefix);
                    if (idx !== -1) {
                        return { _internal: { start: idx, end: idx + searchPattern.length }, _platform: 'wps' };
                    }
                }
            }

            // 3. API Find.Execute 兜底 (限制长度)
            if (searchText.length <= 200) {
                const searchRange = doc.Content;
                if ((searchRange.Find as any).Execute(searchText)) {
                    return { _internal: { start: searchRange.Start, end: searchRange.End }, _platform: 'wps' };
                }
            }
        } catch (err) {
            console.error('[WPS findRange]', err);
        }

        return null;
    }
}
