import type { IRangeMapper, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsRangeMapper implements IRangeMapper {
    public async findRange(originalText: string): Promise<PlatformRange | null> {
        if (!window.wps) return null;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument;
        const searchRange = doc.Content;

        let searchText = originalText.trim();
        // 1. 三级回退第一层：直接精确搜索
        let found = searchRange.Find.Execute(searchText);
        if (found) {
            return { _internal: { start: searchRange.Start, end: searchRange.End }, _platform: 'wps' };
        }

        // 2. 三级回退第二层：截断搜索（规避 API 的 255 字符长度限制）
        if (searchText.length > 200) {
            searchText = searchText.substring(0, 200);
            const freshRange = doc.Content;
            const found2 = freshRange.Find.Execute(searchText);
            if (found2) {
                return { _internal: { start: freshRange.Start, end: freshRange.End }, _platform: 'wps' };
            }
        }

        // 3. 三级回退第三层：段落全集遍历（极端情况兜底机制）
        const paragraphs = doc.Paragraphs;
        const count = paragraphs.Count;
        for (let i = 1; i <= count; i++) {
            const pRange = paragraphs.Item(i).Range;
            if (pRange.Text && pRange.Text.includes(searchText)) {
                return { _internal: { start: pRange.Start, end: pRange.End }, _platform: 'wps' };
            }
        }

        return null;
    }
}
