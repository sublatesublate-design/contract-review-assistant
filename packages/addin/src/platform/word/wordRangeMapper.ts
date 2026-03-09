/* global Word */

import type { IRangeMapper, PlatformRange } from '../types';

export interface WordRangeRef {
    searchText: string;
    paragraphIndex?: number;
}

function cleanForSearch(t: string): string {
    return t
        .replace(/[*?<>|\\/~「」【】〔〕]/g, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripAllPunct(t: string): string {
    return t
        .replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactForCompare(t: string): string {
    return stripAllPunct(t).replace(/\s+/g, '');
}

function calcTextScore(candidateText: string, targetText: string): number {
    const c = compactForCompare(candidateText);
    const t = compactForCompare(targetText);
    if (!c || !t) return -Infinity;

    const minLen = Math.min(c.length, t.length);
    let samePrefix = 0;
    while (samePrefix < minLen && c[samePrefix] === t[samePrefix]) {
        samePrefix++;
    }

    const prefixRatio = samePrefix / Math.max(t.length, 1);
    const containsBonus = c.includes(t) ? 1.2 : (t.includes(c) ? 0.5 : 0);
    const lenPenalty = Math.abs(c.length - t.length) / Math.max(t.length, 1);

    return prefixRatio * 3 + containsBonus - lenPenalty;
}

function isClauseBoundaryParagraph(text: string): boolean {
    const s = text.trim();
    if (!s) return false;
    return (
        /^第[一二三四五六七八九十百千零0-9]+条/.test(s) ||
        /^[一二三四五六七八九十]+、/.test(s) ||
        /^\d+[\.、]/.test(s)
    );
}

async function pickBestSearchResult(
    context: Word.RequestContext,
    results: Word.RangeCollection,
    targetText: string
): Promise<Word.Range | null> {
    if (results.items.length === 0) return null;

    const candidates = results.items.slice(0, 20);
    for (const r of candidates) {
        r.load('text');
    }
    await context.sync();

    let best: Word.Range | null = null;
    let bestScore = -Infinity;

    for (const r of candidates) {
        const score = calcTextScore(r.text || '', targetText);
        if (score > bestScore) {
            bestScore = score;
            best = r;
        }
    }

    return best ?? candidates[0] ?? null;
}

async function expandRangeConservatively(
    context: Word.RequestContext,
    startRange: Word.Range,
    targetText: string,
    originalTextLength: number
): Promise<Word.Range> {
    try {
        let currentRange = startRange;
        currentRange.load('text');
        await context.sync();

        let bestRange = currentRange;
        let bestScore = calcTextScore(currentRange.text || '', targetText);

        const targetLen = Math.max(20, Math.floor(originalTextLength * 0.95));
        let currentLength = currentRange.text.length;
        let lastPara = currentRange.paragraphs.getLast();
        let dropStreak = 0;

        for (let i = 0; i < 6; i++) {
            if (currentLength >= targetLen && i >= 1) break;

            const nextPara = lastPara.getNextOrNullObject();
            nextPara.load('isNullObject,text');
            await context.sync();

            if (nextPara.isNullObject) break;

            if (
                isClauseBoundaryParagraph(nextPara.text || '') &&
                currentLength >= Math.floor(targetLen * 0.6)
            ) {
                break;
            }

            lastPara = nextPara;
            currentRange = startRange.expandTo(lastPara.getRange());
            currentRange.load('text');
            await context.sync();

            currentLength = currentRange.text.length;
            const score = calcTextScore(currentRange.text || '', targetText);

            if (score >= bestScore) {
                bestScore = score;
                bestRange = currentRange;
                dropStreak = 0;
            } else {
                dropStreak++;
                if (dropStreak >= 2 && currentLength >= Math.floor(targetLen * 0.8)) {
                    break;
                }
            }

            if (currentLength > originalTextLength * 2.2) {
                break;
            }
        }

        return bestRange;
    } catch (e) {
        console.warn('[wordRangeMapper] conservative expand failed', e);
        return startRange;
    }
}

async function searchBest(
    context: Word.RequestContext,
    query: string,
    targetText: string,
    expand: boolean,
    originalTextLength: number
): Promise<Word.Range | null> {
    const q = query.trim();
    if (q.length < 2) return null;

    const results = context.document.body.search(q, {
        matchCase: false,
        matchWholeWord: false,
        ignoreSpace: true,
        ignorePunct: true,
    });
    results.load('items');
    await context.sync();

    if (results.items.length === 0) return null;

    const best = await pickBestSearchResult(context, results, targetText);
    if (!best) return null;

    if (!expand) return best;
    return await expandRangeConservatively(context, best, targetText, originalTextLength);
}

export async function resolveWordRange(
    context: Word.RequestContext,
    ref: WordRangeRef
): Promise<Word.Range | null> {
    const text = ref.searchText.trim();
    if (!text) return null;

    const cleanText = cleanForSearch(text);
    const noPunct = stripAllPunct(text);
    const originalLen = text.length;

    // 1) Full-text search when query length is supported.
    if (cleanText.length > 0 && cleanText.length <= 255) {
        const exact = await searchBest(context, cleanText, cleanText, false, originalLen);
        if (exact) return exact;
    }

    // 2) Truncated clean search + conservative expansion.
    if (cleanText.length > 0) {
        const truncated = cleanText.length > 255 ? cleanText.slice(0, 200) : cleanText;
        const r = await searchBest(context, truncated, cleanText, cleanText.length > 255, originalLen);
        if (r) return r;
    }

    // 3) No-punctuation search.
    if (noPunct.length >= 4) {
        const npQuery = noPunct.length > 255 ? noPunct.slice(0, 200) : noPunct;
        const r = await searchBest(context, npQuery, cleanText, noPunct.length > 255, originalLen);
        if (r) return r;
    }

    // 4) Prefix fallback (aggressive queries, conservative expansion).
    const compact = compactForCompare(text);
    for (const n of [80, 50, 30, 20]) {
        const q = compact.slice(0, Math.min(compact.length, n));
        if (q.length < 4) continue;
        const r = await searchBest(context, q, cleanText, true, originalLen);
        if (r) return r;
    }

    // 5) Middle probe fallback.
    if (compact.length > 60) {
        const midStart = Math.floor(compact.length / 2) - 15;
        const mid = compact.slice(midStart, midStart + 30).trim();
        if (mid.length >= 10) {
            const r = await searchBest(context, mid, cleanText, true, originalLen);
            if (r) return r;
        }
    }

    // 6) Paragraph scoring fallback.
    try {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items/text');
        await context.sync();

        let bestPara: Word.Paragraph | null = null;
        let bestParaScore = -Infinity;
        for (const para of paragraphs.items) {
            const score = calcTextScore(para.text || '', cleanText);
            if (score > bestParaScore) {
                bestParaScore = score;
                bestPara = para;
            }
        }

        if (bestPara && bestParaScore > 0.4) {
            return bestPara.getRange();
        }
    } catch {
        // continue to table fallback
    }

    // 7) Table fallback.
    if (text.includes('|') || cleanText.length <= 30) {
        try {
            const tables = context.document.body.tables;
            tables.load('items');
            await context.sync();

            const keyword = compactForCompare(text);
            if (keyword.length >= 2) {
                for (const table of tables.items) {
                    const rows = table.rows;
                    rows.load('items/cells/body/text');
                    await context.sync();

                    for (const row of rows.items) {
                        const cells = row.cells;
                        cells.load('items/body/text');
                        await context.sync();
                        for (const cell of cells.items) {
                            const cellNorm = compactForCompare(cell.body.text || '');
                            if (cellNorm.includes(keyword) || keyword.includes(cellNorm)) {
                                return cell.body.getRange();
                            }
                        }
                    }
                }
            }
        } catch {
            // ignore
        }
    }

    return null;
}

export function createWordRangeMapper(): IRangeMapper {
    return {
        async findRange(originalText: string): Promise<PlatformRange | null> {
            if (!originalText || originalText.trim().length === 0) return null;
            return {
                _internal: { searchText: originalText.trim() } as WordRangeRef,
                _platform: 'word',
            };
        },
    };
}
