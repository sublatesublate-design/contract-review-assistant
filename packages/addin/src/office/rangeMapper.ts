/* global Word */

/**
 * rangeMapper.ts
 * 将 AI 输出的 originalText 映射到 Word 文档中的 Range
 *
 * 三级定位策略：
 * 1. 精确搜索：body.search(originalText)（Word 搜索限制 255 字符）
 * 2. 截断搜索：取前 200 字符（避免 Word 搜索长度限制）
 * 3. 段落回退：遍历段落，找到包含原文的段落，返回该段落 Range
 */

export const rangeMapper = {
    /**
     * 根据 AI 返回的原文字符串，在文档中定位对应的 Range
     * @returns Word.Range 或 null（定位失败）
     */
    async findRange(
        context: Word.RequestContext,
        originalText: string
    ): Promise<Word.Range | null> {
        if (!originalText || originalText.trim().length === 0) return null;

        const text = originalText.trim();

        // --- 策略 1：精确搜索（≤255 字符）---
        try {
            const searchText = text.length <= 255 ? text : text.slice(0, 200);
            const results = context.document.body.search(searchText, {
                matchCase: false,
                matchWholeWord: false,
            });
            results.load('items');
            await context.sync();
            if (results.items.length > 0 && results.items[0]) {
                return results.items[0];
            }
        } catch {
            // 搜索失败，进入下一策略
        }

        // --- 策略 2：截断搜索（取前 100 字符的关键词）---
        if (text.length > 100) {
            try {
                const shortText = text.slice(0, 80).trim();
                const results = context.document.body.search(shortText, {
                    matchCase: false,
                    matchWholeWord: false,
                });
                results.load('items');
                await context.sync();
                if (results.items.length > 0 && results.items[0]) {
                    return results.items[0];
                }
            } catch {
                // 继续
            }
        }

        // --- 策略 3：段落回退，找包含原文关键词的段落 ---
        try {
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load('items/text');
            await context.sync();

            // 取原文前 30 个字符作为关键词
            const keyword = text.slice(0, 30);
            for (const para of paragraphs.items) {
                if (para.text.includes(keyword)) {
                    para.load('text');
                    await context.sync();
                    return para.getRange();
                }
            }
        } catch {
            // 全部失败
        }

        return null;
    },
};
