import type { IRangeMapper, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 鏂囨湰褰掍竴鍖栧伐鍏凤紙涓?wordRangeMapper 淇濇寔涓€鑷达級 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

/** 绉婚櫎鐗规畩瀛楃锛屽悎骞剁┖鐧?*/
function cleanForSearch(t: string): string {
    return t
        .replace(/[\*\?<>|\\/~]/g, '')
        .replace(/[\u3010\u3011\[\]\u3008\u3009\u300c\u300d\u201c\u201d\u2018\u2019]/g, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/** 绉婚櫎鎵€鏈変腑鑻辨枃鏍囩偣锛屽彧淇濈暀 CJK + 瀛楁瘝 + 鏁板瓧 + 绌虹櫧 */
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
    const containsBonus = c.includes(t) ? 1.2 : (t.includes(c) ? 0.6 : 0);
    const lenPenalty = Math.abs(c.length - t.length) / Math.max(t.length, 1);
    return prefixRatio * 3 + containsBonus - lenPenalty;
}

interface AnchorPack {
    compact: string;
    head: string;
    tail: string;
}

function buildAnchors(targetText: string): AnchorPack {
    const compact = compactForCompare(targetText);
    const anchorLen = Math.min(48, Math.max(12, Math.floor(compact.length * 0.2)));
    return {
        compact,
        head: compact.slice(0, anchorLen),
        tail: compact.slice(Math.max(0, compact.length - anchorLen)),
    };
}

function hasAnchor(candidateText: string, anchor: string): boolean {
    if (!anchor || anchor.length < 6) return true;
    return compactForCompare(candidateText).includes(anchor);
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 鍋忕Щ閲忔槧灏勫紩鎿?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

interface NormResult {
    text: string;
    /** map[i] = 褰掍竴鍖栨枃鏈 i 涓瓧绗﹀湪鍘熸枃涓殑绱㈠紩 */
    map: number[];
}

/**
 * 瀵规枃鏈墽琛屽綊涓€鍖栵紝鍚屾椂鏋勫缓 褰掍竴鍖栦綅缃?鈫?鍘熸枃浣嶇疆 鐨勬槧灏勮〃銆? *
 * @param text       鍘熷鏂囨湰
 * @param removeRe   瑕佺Щ闄ょ殑瀛楃姝ｅ垯锛堟瘡涓瓧绗︾嫭绔嬫祴璇曪級
 * @param keepSpaces true = 鎶樺彔绌虹櫧鍚庝繚鐣欎竴涓┖鏍硷紱false = 褰诲簳绉婚櫎鎵€鏈夌┖鐧? */
function normalizeWithMap(
    text: string,
    removeRe: RegExp,
    keepSpaces: boolean,
): NormResult {
    const result: string[] = [];
    const map: number[] = [];
    let prevSpace = true; // 鍒濆 true 鈫?鑷姩 trim 棣栭儴绌虹櫧

    for (let i = 0; i < text.length; i++) {
        let ch = text.charAt(i);
        // 鎹㈣ 鈫?绌烘牸
        if (ch === '\r' || ch === '\n') ch = ' ';
        // 绉婚櫎鍛戒腑瀛楃
        if (removeRe.test(ch)) continue;

        const isSpace = /\s/.test(ch);
        if (isSpace) {
            if (!keepSpaces) continue;   // 褰诲簳鍘荤┖鐧?            if (prevSpace) continue;     // 鎶樺彔杩炵画绌虹櫧
            result.push(' ');
            map.push(i);
            prevSpace = true;
        } else {
            result.push(ch);
            map.push(i);
            prevSpace = false;
        }
    }

    // trim 灏鹃儴绌虹櫧
    while (result.length > 0 && result[result.length - 1] === ' ') {
        result.pop();
        map.pop();
    }

    return { text: result.join(''), map };
}

// 棰勭紪璇戝崟瀛楃姝ｅ垯
const RE_CLEAN_CHAR = /[\*\?<>|\\/~\u3010\u3011\[\]\u3008\u3009\u300c\u300d\u201c\u201d\u2018\u2019]/;
const RE_PUNCT_CHAR = /[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/;
const RE_MATCH_NOTHING = /$a/;

/**
 * 鍦ㄥ綊涓€鍖栧叏鏂囦腑鎼滅储褰掍竴鍖栨ā寮忥紝杩斿洖鍘熸枃 {start, end}銆? */
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

function normIndexOfNearest(
    fullNorm: NormResult,
    searchNorm: NormResult,
    preferRawStart: number
): { start: number; end: number } | null {
    if (searchNorm.text.length < 2) return null;

    let best: { start: number; end: number } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    let idx = fullNorm.text.indexOf(searchNorm.text);
    let guard = 0;
    while (idx !== -1 && guard < 64) {
        const lastNormIdx = idx + searchNorm.text.length - 1;
        if (lastNormIdx < fullNorm.map.length) {
            const start = fullNorm.map[idx]!;
            const end = fullNorm.map[lastNormIdx]! + 1;
            const dist = Math.abs(start - preferRawStart);
            if (!best || dist < bestDistance) {
                best = { start, end };
                bestDistance = dist;
            }
        }
        idx = fullNorm.text.indexOf(searchNorm.text, idx + 1);
        guard++;
    }

    return best;
}

/**
 * 鍓嶇紑鎼滅储锛氬湪褰掍竴鍖栧叏鏂囦腑鎼滅储褰掍竴鍖栧墠缂€銆? * end 閫氳繃鍦ㄥ綊涓€鍖栧叏鏂囨槧灏勮〃涓悜鍚庡欢浼?searchNorm 鐨勫畬鏁撮暱搴︽潵绮剧‘璁＄畻锛? * 鑰岄潪浣跨敤 originalLen 浼扮畻锛堝悗鑰呭湪闆跺瀛楃绛夊満鏅笅浼氬亸绉伙級銆? */
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
    // 鐢ㄦ悳绱㈡枃鏈殑褰掍竴鍖栭暱搴︽潵鎺ㄧ畻 end 鍦ㄥ叏鏂囨槧灏勮〃涓殑浣嶇疆
    const estEndNormIdx = idx + searchNorm.text.length - 1;
    let origEnd: number;
    if (estEndNormIdx < fullNorm.map.length) {
        origEnd = fullNorm.map[estEndNormIdx]! + 1;
    } else {
        // Fallback when normalized index is out of bound.
        origEnd = Math.min(origStart + _originalLen, fullTextLen);
    }
    return { start: origStart, end: origEnd };
}

function normalizeLineBreaksToSpace(text: string): string {
    return text
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildSmartProbes(probeStr: string): string[] {
    const base = normalizeLineBreaksToSpace(probeStr);
    if (!base) return [];

    const probes: string[] = [];
    const pushProbe = (src?: string) => {
        const oneLine = normalizeLineBreaksToSpace(src || '');
        if (!oneLine) return;
        const clipped = oneLine.slice(0, 150).trim();
        if (clipped.length < 6) return;
        if (!probes.includes(clipped)) {
            probes.push(clipped);
        }
    };

    // 1) Original head probe.
    pushProbe(base);

    // 2) First sentence before punctuation.
    const firstSentence = base.split(/[\u3002\uff1b;\uff01\uff1f!?]/)[0];
    pushProbe(firstSentence);

    // 3) Skip "第X条 ..." heading and probe正文首句.
    const bodyWithoutHeading = base.replace(
        /^\s*\u7b2c[\u4e00-\u9fa5\d]+\u6761(?:\s*[^\r\n\u3002\uff1b;]{0,24})?\s*/,
        ''
    );
    const bodyFirstSentence = bodyWithoutHeading.split(/[\u3002\uff1b;\uff01\uff1f!?]/)[0];
    pushProbe(bodyFirstSentence || bodyWithoutHeading);

    // 4) Remove bracket forms often rewritten by model.
    const withoutBrackets = base.replace(/[\u3010\u3011\[\]]/g, '');
    pushProbe(withoutBrackets);

    // 5) Keep old behavior as fallback.
    pushProbe(probeStr);

    return probes;
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 WpsRangeMapper 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

export class WpsRangeMapper implements IRangeMapper {
    private _cachedFullText: string | null = null;
    private _cachedRawFull: NormResult | null = null;
    private _cachedCleanFull: NormResult | null = null;
    private _cachedPunctFull: NormResult | null = null;
    private _cacheTimestamp: number = 0;
    private _cachedDocEnd: number | null = null;

    // Keep cache long enough for batch actions, and pair it with doc length checks plus explicit invalidation.
    private static CACHE_TTL_MS = 10000;
    public invalidateCache(): void {
        this._cachedFullText = null;
        this._cachedRawFull = null;
        this._cachedCleanFull = null;
        this._cachedPunctFull = null;
        this._cacheTimestamp = 0;
        this._cachedDocEnd = null;
    }

    private getDocEnd(doc: any): number {
        try {
            return doc?.Content?.End || 999999;
        } catch {
            return 999999;
        }
    }

    private sanitizeRange(doc: any, r: { start: number; end: number }): { start: number; end: number } {
        const docEnd = this.getDocEnd(doc);
        const start = Math.max(0, Math.min(docEnd, Math.floor(r.start)));
        const endRaw = Math.max(start + 1, Math.floor(r.end));
        const end = Math.max(start + 1, Math.min(docEnd, endRaw));
        return { start, end };
    }

    private scoreRangeText(candidateText: string, searchText: string): number {
        const anchors = buildAnchors(searchText);
        const base = calcTextScore(candidateText, searchText);
        if (!Number.isFinite(base)) return -Infinity;
        const headBonus = hasAnchor(candidateText, anchors.head) ? 1.1 : -0.8;
        const tailBonus = hasAnchor(candidateText, anchors.tail) ? 1.1 : -0.8;
        return base + headBonus + tailBonus;
    }

    private expandHitToBestRange(
        doc: any,
        candidate: { start: number; end: number },
        searchText: string
    ): { start: number; end: number } {
        const safe = this.sanitizeRange(doc, candidate);
        const docEnd = this.getDocEnd(doc);
        const targetLen = Math.max(searchText.length, 1);

        const windowStart = Math.max(0, safe.start - 120);
        const windowEnd = Math.min(
            docEnd,
            Math.max(safe.end + 120, safe.start + Math.max(targetLen * 2 + 320, 640))
        );
        if (windowEnd <= windowStart + 1) return safe;

        const windowText = doc.Range(windowStart, windowEnd).Text || '';
        if (!windowText) return safe;

        const prefer = Math.max(0, safe.start - windowStart);
        const cleanWindow = normalizeWithMap(windowText, RE_CLEAN_CHAR, true);
        const cleanSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true);
        const punctWindow = normalizeWithMap(windowText, RE_PUNCT_CHAR, true);
        const punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true);

        const fromClean = normIndexOfNearest(cleanWindow, cleanSearch, prefer);
        const fromPunct = normIndexOfNearest(punctWindow, punctSearch, prefer);

        const options: Array<{ start: number; end: number }> = [safe];
        if (fromClean) {
            options.push({
                start: windowStart + fromClean.start,
                end: windowStart + fromClean.end,
            });
        }
        if (fromPunct) {
            options.push({
                start: windowStart + fromPunct.start,
                end: windowStart + fromPunct.end,
            });
        }

        const getTextFromWindow = (normalized: { start: number; end: number }): string => {
            const localStart = Math.max(0, normalized.start - windowStart);
            const localEnd = Math.max(localStart, Math.min(windowText.length, normalized.end - windowStart));
            if (localEnd <= localStart) return '';
            return windowText.slice(localStart, localEnd);
        };

        let best = safe;
        let bestScore = -Infinity;
        for (const opt of options) {
            const normalized = this.sanitizeRange(doc, opt);
            const text = getTextFromWindow(normalized);
            const score = this.scoreRangeText(text, searchText);
            if (score > bestScore) {
                bestScore = score;
                best = normalized;
            }
        }

        return best;
    }

    /**
     * 鏋侀€熷垏鍧楁煡鎵炬柟妗堬細
     * 涓嶈皟鐢ㄦ瀬澶у紑閿€鐨?doc.Content.Text锛堝叏閲忓簭鍒楀寲鍙兘鑰楁椂鏁扮锛夛紝
     * 鑰屾槸鍒╃敤 WPS 鍘熺敓 C++ 绾х殑 Find.Execute("鎺㈤拡") 鐬棿閿佸畾鍓嶇紑浣嶇疆锛?     * 鍙埅鍙栫洰鏍囧強鍏跺悗鍑犵櫨瀛楃殑涓€灏忓潡 (Chunk) 鎷夎繘 JS 杩涜绮剧‘鏌ユ壘鍖归厤銆?     */
    private fastChunkFind(doc: any, searchPattern: string, searchText: string): PlatformRange | null {
        try {
            const ellipsisMatch = searchPattern.match(/\.{3,}|\u2026+/);
            const hasEllipsis = !!ellipsisMatch && ellipsisMatch.index! > 5;
            const probeStr = hasEllipsis ? searchPattern.substring(0, ellipsisMatch.index) : searchPattern;
            const probes = buildSmartProbes(probeStr);
            const parts = hasEllipsis ? searchText.split(/\.{3,}|\u2026+/) : [];
            const normalizedSearchPattern = normalizeLineBreaksToSpace(searchPattern);

            for (const probe of probes) {
                const searchRange = doc.Content;
                searchRange.Find.ClearFormatting();
                if (!(searchRange.Find as any).Execute(probe)) {
                    continue;
                }

                const chunkStart = searchRange.Start;
                const fetchLen = hasEllipsis ? 3000 : searchText.length + 500;
                let chunkEnd: number;
                try {
                    chunkEnd = Math.min(doc.Content.End || 999999, chunkStart + fetchLen);
                } catch {
                    chunkEnd = chunkStart + fetchLen;
                }

                const chunkRange = doc.Range(chunkStart, chunkEnd);
                const chunkText = chunkRange.Text || '';
                if (!chunkText) {
                    continue;
                }

                const hit = (r: { start: number; end: number }): PlatformRange =>
                    ({ _internal: { start: chunkStart + r.start, end: chunkStart + r.end }, _platform: 'wps' });

                const exactIdx = chunkText.indexOf(searchPattern);
                if (exactIdx !== -1) {
                    return hit({ start: exactIdx, end: exactIdx + searchPattern.length });
                }

                const normalizedChunkIdx = normalizeLineBreaksToSpace(chunkText).indexOf(normalizedSearchPattern);
                if (normalizedChunkIdx !== -1) {
                    const rawNorm = normalizeWithMap(chunkText, RE_MATCH_NOTHING, true);
                    const searchNorm = normalizeWithMap(searchPattern, RE_MATCH_NOTHING, true);
                    const mapped = normIndexOf(rawNorm, searchNorm);
                    if (mapped) {
                        return hit(mapped);
                    }
                }

                const normChunk = normalizeWithMap(chunkText, RE_CLEAN_CHAR, true);
                const normSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true);
                const rClean = normIndexOf(normChunk, normSearch);
                if (rClean) {
                    return hit(rClean);
                }

                const punctChunk = normalizeWithMap(chunkText, RE_PUNCT_CHAR, true);
                const punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true);
                const rPunct = normIndexOf(punctChunk, punctSearch);
                if (rPunct) {
                    return hit(rPunct);
                }

                if (parts.length >= 2) {
                    const pPrefix = parts[0]?.trim() || '';
                    const pSuffix = parts[parts.length - 1]?.trim() || '';

                    if (pPrefix.length >= 5 && pSuffix.length >= 5) {
                        const preNorm = normalizeWithMap(pPrefix, RE_CLEAN_CHAR, true);
                        const sufNorm = normalizeWithMap(pSuffix, RE_CLEAN_CHAR, true);
                        const matchPre = normIndexOf(normChunk, preNorm);
                        if (matchPre) {
                            const remainText = chunkText.substring(matchPre.end);
                            const remainNorm = normalizeWithMap(remainText, RE_CLEAN_CHAR, true);
                            const matchSuf = normIndexOf(remainNorm, sufNorm);
                            if (matchSuf) {
                                return hit({
                                    start: matchPre.start,
                                    end: matchPre.end + matchSuf.end,
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[WPS findRange] fastChunkFind failed, fallback to full-scan.', e);
        }
        return null;
    }

    private getFullText(doc: any): string {
        const now = Date.now();
        const docEnd = this.getDocEnd(doc);
        const isCacheFresh = (now - this._cacheTimestamp) < WpsRangeMapper.CACHE_TTL_MS;
        const isDocLengthStable = this._cachedDocEnd !== null && this._cachedDocEnd === docEnd;

        if (this._cachedFullText && isCacheFresh && isDocLengthStable) {
            return this._cachedFullText;
        }

        this._cachedFullText = doc.Content.Text || '';
        this._cacheTimestamp = now;
        this._cachedDocEnd = docEnd;
        this._cachedRawFull = null;
        this._cachedCleanFull = null;
        this._cachedPunctFull = null;
        return this._cachedFullText as string;
    }

    public async preloadFullText(): Promise<void> {
        if (!window.wps) return;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;
        this.getFullText(doc);
    }

    public findRangeFromCache(originalText: string): PlatformRange | null {
        const searchText = originalText.trim();
        const fullText = this._cachedFullText;
        if (!searchText || !fullText) return null;

        const searchPattern = searchText.replace(/\r?\n/g, '\r');
        const hit = (r: { start: number; end: number }): PlatformRange =>
            ({ _internal: { start: r.start, end: r.end }, _platform: 'wps' });

        const exactIdx = fullText.indexOf(searchPattern);
        if (exactIdx !== -1) {
            return hit({ start: exactIdx, end: exactIdx + searchPattern.length });
        }

        const rawFull = this._cachedRawFull || (this._cachedRawFull = normalizeWithMap(fullText, RE_MATCH_NOTHING, true));
        const rawSearch = normalizeWithMap(searchPattern, RE_MATCH_NOTHING, true);
        const rRaw = normIndexOf(rawFull, rawSearch);
        if (rRaw) {
            return hit(rRaw);
        }

        const cleanFull = this._cachedCleanFull || (this._cachedCleanFull = normalizeWithMap(fullText, RE_CLEAN_CHAR, true));
        const cleanSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true);
        const rClean = normIndexOf(cleanFull, cleanSearch);
        if (rClean) {
            return hit(rClean);
        }

        const punctFull = this._cachedPunctFull || (this._cachedPunctFull = normalizeWithMap(fullText, RE_PUNCT_CHAR, true));
        const punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true);
        const rPunct = normIndexOf(punctFull, punctSearch);
        if (rPunct) {
            return hit(rPunct);
        }

        return null;
    }

    public async findRange(originalText: string): Promise<PlatformRange | null> {
        if (!window.wps) return null;
        const app = window.wps.WpsApplication() as any;
        const doc = app.ActiveDocument;

        const searchText = originalText.trim();
        if (!searchText) return null;
        const searchPattern = searchText.replace(/\r?\n/g, '\r');

        try {
            const fastRes = this.fastChunkFind(doc, searchPattern, searchText);
            if (fastRes) return fastRes;

            const fullText = this.getFullText(doc);
            if (!fullText) {
                console.warn('[WPS findRange] full text is empty.');
                return null;
            }

            let rawSearch: NormResult | undefined;
            let cleanSearch: NormResult | undefined;
            let punctSearch: NormResult | undefined;

            const getRawFull = () => this._cachedRawFull || (this._cachedRawFull = normalizeWithMap(fullText, RE_MATCH_NOTHING, true));
            const getCleanFull = () => this._cachedCleanFull || (this._cachedCleanFull = normalizeWithMap(fullText, RE_CLEAN_CHAR, true));
            const getPunctFull = () => this._cachedPunctFull || (this._cachedPunctFull = normalizeWithMap(fullText, RE_PUNCT_CHAR, true));
            const getRawSearch = () => rawSearch || (rawSearch = normalizeWithMap(searchPattern, RE_MATCH_NOTHING, true));
            const getCleanSearch = () => cleanSearch || (cleanSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true));
            const getPunctSearch = () => punctSearch || (punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true));

            const hit = (r: { start: number; end: number }, shouldRefine = true): PlatformRange => {
                const normalized = this.sanitizeRange(doc, r);
                if (!shouldRefine) {
                    return { _internal: normalized, _platform: 'wps' };
                }
                const refined = this.expandHitToBestRange(doc, normalized, searchText);
                return { _internal: refined, _platform: 'wps' };
            };

            const exactIdx = fullText.indexOf(searchPattern);
            if (exactIdx !== -1) {
                return hit({ start: exactIdx, end: exactIdx + searchPattern.length }, false);
            }

            const rawHit = normIndexOf(getRawFull(), getRawSearch());
            if (rawHit) {
                return hit(rawHit);
            }

            const cleanHit = normIndexOf(getCleanFull(), getCleanSearch());
            if (cleanHit) {
                return hit(cleanHit);
            }

            const punctHit = normIndexOf(getPunctFull(), getPunctSearch());
            if (punctHit) {
                return hit(punctHit);
            }

            for (const prefixLen of [80, 50, 30, 20]) {
                const cleanPrefixHit = normPrefixSearch(
                    getCleanFull(),
                    getCleanSearch(),
                    prefixLen,
                    searchText.length,
                    fullText.length
                );
                if (cleanPrefixHit) {
                    return hit(cleanPrefixHit);
                }

                const punctPrefixHit = normPrefixSearch(
                    getPunctFull(),
                    getPunctSearch(),
                    prefixLen,
                    searchText.length,
                    fullText.length
                );
                if (punctPrefixHit) {
                    return hit(punctPrefixHit);
                }
            }

            const cs = getCleanSearch();
            if (cs.text.length > 60) {
                const midStart = Math.floor(cs.text.length / 2) - 15;
                const midText = cs.text.slice(midStart, midStart + 30).trim();
                if (midText.length >= 10) {
                    const cf = getCleanFull();
                    const midIdx = cf.text.indexOf(midText);
                    if (midIdx !== -1) {
                        const fullMatchIdx = midIdx - midStart;
                        if (fullMatchIdx >= 0 && fullMatchIdx < cf.map.length) {
                            const estStart = cf.map[fullMatchIdx]!;
                            const estEndNormIdx = fullMatchIdx + cs.text.length - 1;
                            const estEnd = estEndNormIdx >= 0 && estEndNormIdx < cf.map.length
                                ? cf.map[estEndNormIdx]! + 1
                                : Math.min(fullText.length, estStart + searchText.length);
                            return hit({ start: estStart, end: estEnd });
                        }
                    }
                }
            }

            if (searchText.length <= 200) {
                try {
                    const searchRange = doc.Content;
                    if ((searchRange.Find as any).Execute(searchText)) {
                        return hit({ start: searchRange.Start, end: searchRange.End }, false);
                    }
                } catch {
                    // ignore find fallback error
                }
            }

            console.warn(
                `[WPS findRange] no match for: "${searchText.slice(0, 60)}${searchText.length > 60 ? '...' : ''}"`
            );
        } catch (err) {
            console.error('[WPS findRange] failed:', err);
        }

        return null;
    }
}
