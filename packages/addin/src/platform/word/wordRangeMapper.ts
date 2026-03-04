/* global Word */

import type { IRangeMapper, PlatformRange } from '../types';

/**
 * Word 适配器的 Range 内部表示
 * Word.Range 对象仅在 Word.run 上下文内有效，不能跨 run 持久化
 * 所以存储搜索元数据，在需要时重新查找
 */
export interface WordRangeRef {
    searchText: string;
    paragraphIndex?: number;
}

/** 在 Word.run 上下文中根据 WordRangeRef 重新定位 Range */
export async function resolveWordRange(
    context: Word.RequestContext,
    ref: WordRangeRef
): Promise<Word.Range | null> {
    const text = ref.searchText.trim();
    if (!text) return null;

    // 策略 1：精确搜索
    try {
        // 清理搜索文本中的通配符，防止导致搜索错误
        let cleanText = text.replace(/[*?<>]/g, '');
        const searchText = cleanText.length <= 255 ? cleanText : cleanText.slice(0, 200);
        const results = context.document.body.search(searchText, {
            matchCase: false,
            matchWholeWord: false,
            ignoreSpace: true,
            ignorePunct: true,
        });
        results.load('items');
        await context.sync();
        if (results.items.length > 0 && results.items[0]) {
            return results.items[0];
        }
    } catch { /* 进入下一策略 */ }

    // 策略 2：截断搜索
    if (text.length > 100) {
        try {
            // 清理通配符
            let cleanText = text.replace(/[*?<>]/g, '');
            const shortText = cleanText.slice(0, 80).trim();
            const results = context.document.body.search(shortText, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true,
                ignorePunct: true,
            });
            results.load('items');
            await context.sync();
            if (results.items.length > 0 && results.items[0]) {
                return results.items[0];
            }
        } catch { /* 继续 */ }
    }

    // 策略 3：段落回退
    try {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items/text');
        await context.sync();

        const keyword = text.slice(0, 30);
        for (const para of paragraphs.items) {
            if (para.text.includes(keyword)) {
                para.load('text');
                await context.sync();
                return para.getRange();
            }
        }
    } catch { /* 全部失败 */ }

    return null;
}

export function createWordRangeMapper(): IRangeMapper {
    return {
        async findRange(originalText: string): Promise<PlatformRange | null> {
            if (!originalText || originalText.trim().length === 0) return null;

            // 先验证能找到，同时缓存搜索文本
            const found = await Word.run(async (context) => {
                return resolveWordRange(context, { searchText: originalText });
            });

            if (!found) return null;

            return {
                _internal: { searchText: originalText.trim() } as WordRangeRef,
                _platform: 'word',
            };
        },
    };
}
