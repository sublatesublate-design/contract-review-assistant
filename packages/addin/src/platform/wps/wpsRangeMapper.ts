import type { IRangeMapper, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

/* ══════════ 文本归一化工具（与 wordRangeMapper 保持一致） ══════════ */

/** 移除特殊字符，合并空白 */
function cleanForSearch(t: string): string {
    return t
        .replace(/[*?<>|\\/~「」【】〖〗]/g, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 移除所有中英文标点，只保留 CJK + 字母 + 数字 + 空白 */
function stripAllPunct(t: string): string {
    return t
        .replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/* ══════════ 偏移量映射引擎 ══════════ */

interface NormResult {
    text: string;
    /** map[i] = 归一化文本第 i 个字符在原文中的索引 */
    map: number[];
}

/**
 * 对文本执行归一化，同时构建 归一化位置 → 原文位置 的映射表。
 *
 * @param text       原始文本
 * @param removeRe   要移除的字符正则（每个字符独立测试）
 * @param keepSpaces true = 折叠空白后保留一个空格；false = 彻底移除所有空白
 */
function normalizeWithMap(
    text: string,
    removeRe: RegExp,
    keepSpaces: boolean,
): NormResult {
    const result: string[] = [];
    const map: number[] = [];
    let prevSpace = true; // 初始 true → 自动 trim 首部空白

    for (let i = 0; i < text.length; i++) {
        let ch = text.charAt(i);
        // 换行 → 空格
        if (ch === '\r' || ch === '\n') ch = ' ';
        // 移除命中字符
        if (removeRe.test(ch)) continue;

        const isSpace = /\s/.test(ch);
        if (isSpace) {
            if (!keepSpaces) continue;   // 彻底去空白
            if (prevSpace) continue;     // 折叠连续空白
            result.push(' ');
            map.push(i);
            prevSpace = true;
        } else {
            result.push(ch);
            map.push(i);
            prevSpace = false;
        }
    }

    // trim 尾部空白
    while (result.length > 0 && result[result.length - 1] === ' ') {
        result.pop();
        map.pop();
    }

    return { text: result.join(''), map };
}

// 预编译单字符正则
const RE_CLEAN_CHAR = /[*?<>|\\/~「」【】〖〗]/;
const RE_PUNCT_CHAR = /[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/;

/**
 * 在归一化全文中搜索归一化模式，返回原文 {start, end}。
 */
function normIndexOf(
    fullNorm: NormResult,
    searchNorm: NormResult,
): { start: number; end: number } | null {
    if (searchNorm.text.length < 2) return null;
    const idx = fullNorm.text.indexOf(searchNorm.text);
    if (idx === -1) return null;

    const lastNormIdx = idx + searchNorm.text.length - 1;
    if (lastNormIdx >= fullNorm.map.length) return null;

    return {
        start: fullNorm.map[idx]!,
        end: fullNorm.map[lastNormIdx]! + 1,
    };
}

/**
 * 前缀搜索：在归一化全文中搜索归一化前缀。
 * end 通过在归一化全文映射表中向后延伸 searchNorm 的完整长度来精确计算，
 * 而非使用 originalLen 估算（后者在零宽字符等场景下会偏移）。
 */
function normPrefixSearch(
    fullNorm: NormResult,
    searchNorm: NormResult,
    prefixLen: number,
    _originalLen: number,
    fullTextLen: number,
): { start: number; end: number } | null {
    const prefix = searchNorm.text.slice(0, prefixLen);
    if (prefix.length < 4) return null;

    const idx = fullNorm.text.indexOf(prefix);
    if (idx === -1) return null;

    const origStart = fullNorm.map[idx]!;
    // 用搜索文本的归一化长度来推算 end 在全文映射表中的位置
    const estEndNormIdx = idx + searchNorm.text.length - 1;
    let origEnd: number;
    if (estEndNormIdx < fullNorm.map.length) {
        origEnd = fullNorm.map[estEndNormIdx]! + 1;
    } else {
        // 超出映射表范围时回退到末尾
        origEnd = Math.min(origStart + _originalLen, fullTextLen);
    }
    return { start: origStart, end: origEnd };
}

/* ══════════ WpsRangeMapper ══════════ */

export class WpsRangeMapper implements IRangeMapper {
    private _cachedFullText: string | null = null;
    private _cachedCleanFull: NormResult | null = null;
    private _cachedPunctFull: NormResult | null = null;
    private _cacheTimestamp: number = 0;

    // TTL 缩小至 50ms：只给代码层面的 batch 操作（如 batchApply 循环）提供内存复用，
    // 绝不跨越任何人工操作或渲染帧缓存旧文档状态，否则会引发严重的选中区漂移。
    private static CACHE_TTL_MS = 50;

    public invalidateCache(): void {
        this._cachedFullText = null;
        this._cachedCleanFull = null;
        this._cachedPunctFull = null;
        this._cacheTimestamp = 0;
    }

    /**
     * 极速切块查找方案：
     * 不调用极大开销的 doc.Content.Text（全量序列化可能耗时数秒），
     * 而是利用 WPS 原生 C++ 级的 Find.Execute("探针") 瞬间锁定前缀位置，
     * 只截取目标及其后几百字的一小块 (Chunk) 拉进 JS 进行精确查找匹配。
     */
    private fastChunkFind(doc: any, searchPattern: string, searchText: string): PlatformRange | null {
        try {
            // VBA/WPS 原生 Find 支持上限通常为 255 字符，取前 150 即可
            const probe = searchPattern.substring(0, 150);
            const searchRange = doc.Content;

            searchRange.Find.ClearFormatting();
            if ((searchRange.Find as any).Execute(probe)) {
                const chunkStart = searchRange.Start;

                // 取探针命中位置及其后所需长度的一小块 buffer
                const fetchLen = searchText.length + 500;
                let chunkEnd: number;
                try {
                    chunkEnd = Math.min(doc.Content.End || 999999, chunkStart + fetchLen);
                } catch {
                    chunkEnd = chunkStart + fetchLen;
                }

                const chunkRange = doc.Range(chunkStart, chunkEnd);
                const chunkText = chunkRange.Text || "";
                if (!chunkText) return null;

                const hit = (r: { start: number; end: number }): PlatformRange =>
                    ({ _internal: { start: chunkStart + r.start, end: chunkStart + r.end }, _platform: 'wps' });

                // 在这块极小的文本里执行三层退化搜索
                const exactIdx = chunkText.indexOf(searchPattern);
                if (exactIdx !== -1) {
                    console.log(`[WPS findRange] FastChunk极速命中 (Exact)`);
                    return hit({ start: exactIdx, end: exactIdx + searchPattern.length });
                }

                const normChunk = normalizeWithMap(chunkText, RE_CLEAN_CHAR, true);
                const normSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true);
                const rClean = normIndexOf(normChunk, normSearch);
                if (rClean) {
                    console.log(`[WPS findRange] FastChunk极速命中 (Clean)`);
                    return hit(rClean);
                }

                const punctChunk = normalizeWithMap(chunkText, RE_PUNCT_CHAR, true);
                const punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true);
                const rPunct = normIndexOf(punctChunk, punctSearch);
                if (rPunct) {
                    console.log(`[WPS findRange] FastChunk极速命中 (Punct)`);
                    return hit(rPunct);
                }
            }
        } catch (e) {
            console.warn('[WPS findRange] fastChunkFind 极速模式失败, 回退全文档扫描', e);
        }
        return null;
    }

    private getFullText(doc: any): string {
        const now = Date.now();
        if (this._cachedFullText && (now - this._cacheTimestamp) < WpsRangeMapper.CACHE_TTL_MS) {
            return this._cachedFullText;
        }
        this._cachedFullText = doc.Content.Text || '';
        this._cacheTimestamp = now;
        this._cachedCleanFull = null;
        this._cachedPunctFull = null;
        return this._cachedFullText as string;
    }

    public async findRange(originalText: string): Promise<PlatformRange | null> {
        if (!window.wps) return null;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const searchText = originalText.trim();
        if (!searchText) return null;
        const searchPattern = searchText.replace(/\r?\n/g, '\r');

        try {
            // 🔥 第一道防线：极速切块查找（无须跨 COM 传输全量文档，耗时 <0.1秒）
            const fastRes = this.fastChunkFind(doc, searchPattern, searchText);
            if (fastRes) return fastRes;

            // 🐢 第二道防线：兜底的全局全量扫描（将传输数百 KB 到数十 MB 的全文档文本给 JS，很慢）
            const fullText: string = this.getFullText(doc);
            if (!fullText) {
                console.warn('[WPS findRange] 文档内容为空');
                return null;
            }

            /* ── 惰性归一化缓存（避免对整篇文档重复处理） ── */
            let _cleanSearch: NormResult | undefined;
            let _punctSearch: NormResult | undefined;

            const getCleanFull = () => this._cachedCleanFull || (this._cachedCleanFull = normalizeWithMap(fullText!, RE_CLEAN_CHAR, true));
            const getPunctFull = () => this._cachedPunctFull || (this._cachedPunctFull = normalizeWithMap(fullText!, RE_PUNCT_CHAR, true));
            const getCleanSearch = () => _cleanSearch || (_cleanSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true));
            const getPunctSearch = () => _punctSearch || (_punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true));

            const hit = (r: { start: number; end: number }): PlatformRange =>
                ({ _internal: r, _platform: 'wps' });

            // ── 策略 1：原文精确 indexOf ──
            {
                const idx = fullText.indexOf(searchPattern);
                if (idx !== -1) {
                    return hit({ start: idx, end: idx + searchPattern.length });
                }
            }

            // ── 策略 2：cleanForSearch 归一化 indexOf ──
            {
                const r = normIndexOf(getCleanFull(), getCleanSearch());
                if (r) {
                    console.log(`[WPS findRange] 策略2命中 (cleanForSearch), text: "${searchText.slice(0, 40)}..."`);
                    return hit(r);
                }
            }

            // ── 策略 3：stripAllPunct 去标点 indexOf ──
            {
                const r = normIndexOf(getPunctFull(), getPunctSearch());
                if (r) {
                    console.log(`[WPS findRange] 策略3命中 (stripAllPunct), text: "${searchText.slice(0, 40)}..."`);
                    return hit(r);
                }
            }

            // ── 策略 4：前缀递减 fallback (80 → 50 → 30 → 20) ──
            for (const prefixLen of [80, 50, 30, 20]) {
                // 原来的 4a (原始前缀 indexOf) 被移除，因为它在截断后极易发生错配（例如匹配到第一条的 "1、"）
                // 仅保留基于归一化文档树的 4b 和 4c，它们更严谨并且包含原有的位置信息映射计算

                // 4b: cleanForSearch 前缀
                {
                    const r = normPrefixSearch(
                        getCleanFull(), getCleanSearch(),
                        prefixLen, searchText.length, fullText.length,
                    );
                    if (r) {
                        console.log(`[WPS findRange] 策略4b命中 (clean前缀${prefixLen}), text: "${searchText.slice(0, 40)}..."`);
                        return hit(r);
                    }
                }

                // 4c: stripAllPunct 前缀
                {
                    const r = normPrefixSearch(
                        getPunctFull(), getPunctSearch(),
                        prefixLen, searchText.length, fullText.length,
                    );
                    if (r) {
                        console.log(`[WPS findRange] 策略4c命中 (noPunct前缀${prefixLen}), text: "${searchText.slice(0, 40)}..."`);
                        return hit(r);
                    }
                }
            }

            // ── 策略 5：中段搜索（取中间 30 字符） ──
            {
                const cs = getCleanSearch();
                if (cs.text.length > 60) {
                    const midStart = Math.floor(cs.text.length / 2) - 15;
                    const midText = cs.text.slice(midStart, midStart + 30).trim();
                    if (midText.length >= 10) {
                        const cf = getCleanFull();
                        const midIdx = cf.text.indexOf(midText);
                        if (midIdx !== -1) {
                            const origMidStart = cf.map[midIdx]!;
                            const estStart = Math.max(0, origMidStart - midStart);
                            // 使用归一化映射表精确计算 end
                            const estEndNormIdx = midIdx - midStart + cs.text.length - 1;
                            let estEnd: number;
                            if (estEndNormIdx < cf.map.length) {
                                estEnd = cf.map[estEndNormIdx]! + 1;
                            } else {
                                estEnd = Math.min(fullText!.length, estStart + searchText.length);
                            }
                            console.log(`[WPS findRange] 策略5命中 (中段搜索), text: "${searchText.slice(0, 40)}..."`);
                            return hit({ start: estStart, end: estEnd });
                        }
                    }
                }
            }

            // ── 策略 6：API Find.Execute 兜底 ──
            if (searchText.length <= 200) {
                try {
                    const searchRange = doc.Content;
                    if ((searchRange.Find as any).Execute(searchText)) {
                        console.log(`[WPS findRange] 策略6命中 (Find.Execute), text: "${searchText.slice(0, 40)}..."`);
                        return hit({ start: searchRange.Start, end: searchRange.End });
                    }
                } catch { /* Find.Execute 不可用 */ }
            }

            console.warn(
                `[WPS findRange] 全部 6 个策略均失败, text: "${searchText.slice(0, 60)}${searchText.length > 60 ? '...' : ''}"`,
            );
        } catch (err) {
            console.error('[WPS findRange] 异常:', err);
        }

        return null;
    }
}
