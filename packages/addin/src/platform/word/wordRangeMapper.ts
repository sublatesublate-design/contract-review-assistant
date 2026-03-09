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

function cleanForSearch(t: string): string {
    return t
        .replace(/[*?<>|\\/~「」【】〖〗]/g, '') // 移除特殊字符、管道符、中文括号
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// 新增：移除所有中英文标点，只保留文字和数字
function stripAllPunct(t: string): string {
    return t
        .replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/g, '') // 只保留 CJK+字母+数字+空白
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 当截断搜索找到了匹配，尝试扩展范围覆盖完整原文
 *
 * 策略 A：在同段落内搜索完整原文（单段截断）
 * 策略 C：按原文字符数向下扩展段落（多段落截断，避免跨段搜索乱跑到文末）
 */
async function tryExpandRange(
    context: Word.RequestContext,
    foundRange: Word.Range,
    fullCleanText: string,
    originalTextLength: number
): Promise<Word.Range> {
    // 策略 A：同段落内搜索完整文本
    if (fullCleanText.length <= 255) {
        try {
            const paras = foundRange.paragraphs;
            paras.load('items');
            await context.sync();

            for (const para of paras.items) {
                const fullResults = para.search(fullCleanText, {
                    matchCase: false, matchWholeWord: false,
                    ignoreSpace: true, ignorePunct: true,
                });
                fullResults.load('items');
                await context.sync();
                if (fullResults.items.length > 0 && fullResults.items[0]) {
                    return fullResults.items[0];
                }
            }
        } catch { /* 继续策略 C */ }
    }

    // 策略 C：根据期望长度向后扩展段落
    // 为避免全文搜索带来的跨章节误伤，改为从找到的前缀开始，逐段向下收集，
    // 直到包含原文对应长度，最多扩展 10 个段落。
    try {
        let currentRange = foundRange;
        currentRange.load('text');
        await context.sync();

        let lastPara = currentRange.paragraphs.getLast();
        let currentLength = currentRange.text.length;

        // 期待达到原长度的 0.95 倍（去除多余空格/回车的容错）
        const targetLen = originalTextLength * 0.95;

        for (let i = 0; i < 10; i++) {
            if (currentLength >= targetLen) {
                break;
            }
            const nextPara = lastPara.getNextOrNullObject();
            nextPara.load('isNullObject');
            await context.sync();

            if (nextPara.isNullObject) {
                break;
            }

            lastPara = nextPara;
            currentRange = foundRange.expandTo(lastPara.getRange());
            currentRange.load('text');
            await context.sync();
            currentLength = currentRange.text.length;
        }

        // 仅在长度不超过 2 倍原长度时安全返回（允许尾部附带一些换行）
        if (currentRange.text.length <= originalTextLength * 2.5) {
            return currentRange;
        }
    } catch (e) {
        console.warn('[wordRangeMapper] 尝试段落扩展失败', e);
    }

    return foundRange;
}

/** 在 Word.run 上下文中根据 WordRangeRef 重新定位 Range */
export async function resolveWordRange(
    context: Word.RequestContext,
    ref: WordRangeRef
): Promise<Word.Range | null> {
    const text = ref.searchText.trim();
    if (!text) return null;

    const cleanText = cleanForSearch(text);
    const originalLen = text.length;

    // 策略 1：精确搜索
    try {
        const wasTruncated = cleanText.length > 255;
        const searchText = wasTruncated ? cleanText.slice(0, 200) : cleanText;
        const results = context.document.body.search(searchText, {
            matchCase: false,
            matchWholeWord: false,
            ignoreSpace: true,
            ignorePunct: true,
        });
        results.load('items');
        await context.sync();
        if (results.items.length > 0 && results.items[0]) {
            if (wasTruncated) {
                return await tryExpandRange(context, results.items[0], cleanText, originalLen);
            }
            return results.items[0];
        }
    } catch { /* 进入下一策略 */ }

    // 策略 1.5：去标点精确搜索
    try {
        const noPunct = stripAllPunct(text);
        const searchText = noPunct.length <= 255 ? noPunct : noPunct.slice(0, 200);
        if (searchText.length >= 4) {
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
        }
    } catch { /* 继续 */ }

    // 策略 2：截断搜索 (80字符) + 范围扩展
    if (cleanText.length > 80) {
        try {
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
                return await tryExpandRange(context, results.items[0], cleanText, originalLen);
            }
        } catch { /* 继续 */ }
    }

    // 策略 3：短前缀搜索 (30字符) + 范围扩展
    if (cleanText.length > 30) {
        try {
            const shortPrefix = cleanText.slice(0, 30).trim();
            const results = context.document.body.search(shortPrefix, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true,
                ignorePunct: true,
            });
            results.load('items');
            await context.sync();
            if (results.items.length > 0 && results.items[0]) {
                return await tryExpandRange(context, results.items[0], cleanText, originalLen);
            }
        } catch { /* 继续 */ }
    }

    // 策略 3.5：去标点短前缀搜索 (20字符) + 范围扩展
    try {
        const noPunct = stripAllPunct(text).replace(/\s+/g, '');
        const shortNoPunct = noPunct.slice(0, Math.min(noPunct.length, 20));
        if (shortNoPunct.length >= 4) {
            const results = context.document.body.search(shortNoPunct, {
                matchCase: false, matchWholeWord: false,
                ignoreSpace: true, ignorePunct: true,
            });
            results.load('items');
            await context.sync();
            if (results.items.length > 0 && results.items[0]) {
                return await tryExpandRange(context, results.items[0], cleanText, originalLen);
            }
        }
    } catch { /* 继续 */ }

    // 策略 4：中段搜索 (取中间30字符) + 范围扩展
    if (cleanText.length > 60) {
        try {
            const midStart = Math.floor(cleanText.length / 2) - 15;
            const midText = cleanText.slice(midStart, midStart + 30).trim();
            if (midText.length >= 10) {
                const results = context.document.body.search(midText, {
                    matchCase: false, matchWholeWord: false,
                    ignoreSpace: true, ignorePunct: true,
                });
                results.load('items');
                await context.sync();
                if (results.items.length > 0 && results.items[0]) {
                    return await tryExpandRange(context, results.items[0], cleanText, originalLen);
                }
            }
        } catch { /* 继续 */ }
    }

    // 策略 5：段落回退（增强版：多子串匹配，容忍 AI 措辞差异）
    try {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items/text');
        await context.sync();

        // 生成多个子串探针：从文本的 0, 1/4, 1/2, 3/4 位置各取 15 字符
        const norm = stripAllPunct(text).replace(/\s+/g, '');
        const probeLen = 15;
        const probes: string[] = [];
        if (norm.length <= probeLen) {
            if (norm.length >= 4) probes.push(norm);
        } else {
            const positions = [0, 0.25, 0.5, 0.75].map(r => Math.floor(r * (norm.length - probeLen)));
            for (const pos of positions) {
                probes.push(norm.slice(pos, pos + probeLen));
            }
        }

        if (probes.length > 0) {
            for (const para of paragraphs.items) {
                const paraNorm = stripAllPunct(para.text).replace(/\s+/g, '');
                if (probes.some(probe => paraNorm.includes(probe))) {
                    para.load('text');
                    await context.sync();
                    return para.getRange();
                }
            }
        }
    } catch { /* 继续 */ }

    // 策略 6：表格搜索（对短文本或含 | 的文本特别处理）
    if (text.includes('|') || cleanText.length <= 30) {
        try {
            const tables = context.document.body.tables;
            tables.load('items');
            await context.sync();

            const searchKeyword = stripAllPunct(text).replace(/\s+/g, '');
            if (searchKeyword.length >= 2 && tables.items.length > 0) {
                for (const table of tables.items) {
                    const rows = table.rows;
                    rows.load('items/cells/body/text');
                    await context.sync();

                    for (const row of rows.items) {
                        const cells = row.cells;
                        cells.load('items/body/text');
                        await context.sync();
                        for (const cell of cells.items) {
                            const cellNorm = stripAllPunct(cell.body.text).replace(/\s+/g, '');
                            if (cellNorm.includes(searchKeyword) || searchKeyword.includes(cellNorm)) {
                                return cell.body.getRange();
                            }
                        }
                    }
                }
            }
        } catch { /* 表格搜索失败 */ }
    }

    return null;
}

export function createWordRangeMapper(): IRangeMapper {
    return {
        async findRange(originalText: string): Promise<PlatformRange | null> {
            if (!originalText || originalText.trim().length === 0) return null;

            // 性能优化：直接返回搜索元数据，跳过验证性 Word.run
            // 实际解析推迟到后续操作 (addComment / applySuggestedEdit 等) 的 Word.run 内一次性完成
            // 消除了每次操作的双重 Word.run + 双重全文搜索开销
            return {
                _internal: { searchText: originalText.trim() } as WordRangeRef,
                _platform: 'word',
            };
        },
    };
}
