import type { IRangeMapper, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 鏂囨湰褰掍竴鍖栧伐鍏凤紙涓?wordRangeMapper 淇濇寔涓€鑷达級 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

/** 绉婚櫎鐗规畩瀛楃锛屽悎骞剁┖鐧?*/
function cleanForSearch(t: string): string {
    return t
        .replace(/[\*\?<>|\\/~]/g, '')
        .replace(/[“”‘’「」『』【】]/g, '')
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
const RE_CLEAN_CHAR = /[\\*\\?<>|\\\\/~“”’「」『』【】]/;
const RE_PUNCT_CHAR = /[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/;

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

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 WpsRangeMapper 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

export class WpsRangeMapper implements IRangeMapper {
    private _cachedFullText: string | null = null;
    private _cachedCleanFull: NormResult | null = null;
    private _cachedPunctFull: NormResult | null = null;
    private _cacheTimestamp: number = 0;
    private _cachedDocEnd: number | null = null;

    // Keep cache long enough for batch actions, and pair it with doc length checks plus explicit invalidation.
    private static CACHE_TTL_MS = 10000;
    public invalidateCache(): void {
        this._cachedFullText = null;
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
        const windowEnd = Math.min(docEnd, safe.start + Math.max(targetLen * 2 + 320, 640));
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

        let best = safe;
        let bestScore = -Infinity;
        for (const opt of options) {
            const normalized = this.sanitizeRange(doc, opt);
            const text = doc.Range(normalized.start, normalized.end).Text || '';
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
            // 澶勭悊 LLM 杩斿洖甯︾渷鐣ュ彿鐨勫師鏂?(濡?"绗竴鏉?..绗笁娆?)
            const ellipsisMatch = searchPattern.match(/\.{3,}|\u2026+/);
            const hasEllipsis = !!ellipsisMatch && ellipsisMatch.index! > 5;

            // 鎺㈤拡涓€瀹氫笉鑳藉寘鍚渷鐣ュ彿锛堝惁鍒欏師鐢?Find 鑲畾鎵句笉鍒板師鏂囷級
            let probeStr = hasEllipsis ? searchPattern.substring(0, ellipsisMatch.index) : searchPattern;
            const probe = probeStr.substring(0, 150);

            const searchRange = doc.Content;
            searchRange.Find.ClearFormatting();
            if ((searchRange.Find as any).Execute(probe)) {
                const chunkStart = searchRange.Start;

                // 鍙栨帰閽堝懡涓綅缃強鍏跺悗鎵€闇€闀垮害鐨勪竴灏忓潡 buffer
                // 濡傛灉鏈夌渷鐣ュ彿锛岃烦杩囩殑鍘熸枃鍙兘寰堥暱锛屽鎴彇涓€浜涳紱鍚﹀垯鎴彇 searchText.length + 500 瓒冲
                const fetchLen = hasEllipsis ? 3000 : searchText.length + 500;
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

                const exactIdx = chunkText.indexOf(searchPattern);
                if (exactIdx !== -1) {
                    console.log(`[WPS findRange] FastChunk鏋侀€熷懡涓?(Exact)`);
                    return hit({ start: exactIdx, end: exactIdx + searchPattern.length });
                }

                const normChunk = normalizeWithMap(chunkText, RE_CLEAN_CHAR, true);
                const normSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true);
                const rClean = normIndexOf(normChunk, normSearch);
                if (rClean) {
                    console.log(`[WPS findRange] FastChunk鏋侀€熷懡涓?(Clean)`);
                    return hit(rClean);
                }

                const punctChunk = normalizeWithMap(chunkText, RE_PUNCT_CHAR, true);
                const punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true);
                const rPunct = normIndexOf(punctChunk, punctSearch);
                if (rPunct) {
                    console.log(`[WPS findRange] FastChunk鏋侀€熷懡涓?(Punct)`);
                    return hit(rPunct);
                }

                // 甯歌鎼滅储澶辫触鏃讹紝濡傛灉瀛樺湪鐪佺暐鍙凤紝灏濊瘯銆庡妶瑁傛悳绱㈢瓥鐣ャ€忔壘鐪熷疄缁撳熬
                if (hasEllipsis) {
                    const parts = searchText.split(/\.{3,}|\u2026+/);
                    if (parts.length >= 2) {
                        const pPrefix = parts[0]?.trim() || '';
                        const pSuffix = parts[parts.length - 1]?.trim() || ''; // 鍙栨渶鍚庝竴娈典负鍚庣紑

                        if (pPrefix.length >= 5 && pSuffix.length >= 5) {
                            const preNorm = normalizeWithMap(pPrefix, RE_CLEAN_CHAR, true);
                            const sufNorm = normalizeWithMap(pSuffix, RE_CLEAN_CHAR, true);

                            const matchPre = normIndexOf(normChunk, preNorm);
                            if (matchPre) {
                                // 鍦ㄥ墠缂€鍛戒腑浣嶇疆涔嬪悗瀵绘壘鍚庣紑
                                const remainText = chunkText.substring(matchPre.end);
                                const remainNorm = normalizeWithMap(remainText, RE_CLEAN_CHAR, true);
                                const matchSuf = normIndexOf(remainNorm, sufNorm);

                                if (matchSuf) {
                                    console.log(`[WPS findRange] FastChunk鏋侀€熷懡涓?(Ellipsis Split)`);
                                    return hit({
                                        start: matchPre.start,
                                        end: matchPre.end + matchSuf.end // 鍋忕Щ瑕佸湪鍘熷尮閰嶅熀纭€鍔犱笂
                                    });
                                }
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
            // 馃敟 绗竴閬撻槻绾匡細鏋侀€熷垏鍧楁煡鎵撅紙鏃犻』璺?COM 浼犺緭鍏ㄩ噺鏂囨。锛岃€楁椂 <0.1绉掞級
            const fastRes = this.fastChunkFind(doc, searchPattern, searchText);
            if (fastRes) {
                const info = fastRes._internal as { start: number; end: number };
                const refined = this.expandHitToBestRange(doc, info, searchText);
                return { _internal: refined, _platform: 'wps' };
            }

            // 馃悽 绗簩閬撻槻绾匡細鍏滃簳鐨勫叏灞€鍏ㄩ噺鎵弿锛堝皢浼犺緭鏁扮櫨 KB 鍒版暟鍗?MB 鐨勫叏鏂囨。鏂囨湰缁?JS锛屽緢鎱級
            const fullText: string = this.getFullText(doc);
            if (!fullText) {
                console.warn('[WPS findRange] 鏂囨。鍐呭涓虹┖');
                return null;
            }

            /* 鈹€鈹€ 鎯版€у綊涓€鍖栫紦瀛橈紙閬垮厤瀵规暣绡囨枃妗ｉ噸澶嶅鐞嗭級 鈹€鈹€ */
            let _cleanSearch: NormResult | undefined;
            let _punctSearch: NormResult | undefined;

            const getCleanFull = () => this._cachedCleanFull || (this._cachedCleanFull = normalizeWithMap(fullText!, RE_CLEAN_CHAR, true));
            const getPunctFull = () => this._cachedPunctFull || (this._cachedPunctFull = normalizeWithMap(fullText!, RE_PUNCT_CHAR, true));
            const getCleanSearch = () => _cleanSearch || (_cleanSearch = normalizeWithMap(searchText, RE_CLEAN_CHAR, true));
            const getPunctSearch = () => _punctSearch || (_punctSearch = normalizeWithMap(searchText, RE_PUNCT_CHAR, true));

            const hit = (r: { start: number; end: number }): PlatformRange => {
                const refined = this.expandHitToBestRange(doc, r, searchText);
                return { _internal: refined, _platform: 'wps' };
            };

            // 鈹€鈹€ 绛栫暐 1锛氬師鏂囩簿纭?indexOf 鈹€鈹€
            {
                const idx = fullText.indexOf(searchPattern);
                if (idx !== -1) {
                    return hit({ start: idx, end: idx + searchPattern.length });
                }
            }

            // 鈹€鈹€ 绛栫暐 2锛歝leanForSearch 褰掍竴鍖?indexOf 鈹€鈹€
            {
                const r = normIndexOf(getCleanFull(), getCleanSearch());
                if (r) {
                    console.log(`[WPS findRange] 绛栫暐2鍛戒腑 (cleanForSearch), text: "${searchText.slice(0, 40)}..."`);
                    return hit(r);
                }
            }

            // 鈹€鈹€ 绛栫暐 3锛歴tripAllPunct 鍘绘爣鐐?indexOf 鈹€鈹€
            {
                const r = normIndexOf(getPunctFull(), getPunctSearch());
                if (r) {
                    console.log(`[WPS findRange] 绛栫暐3鍛戒腑 (stripAllPunct), text: "${searchText.slice(0, 40)}..."`);
                    return hit(r);
                }
            }

            // 鈹€鈹€ 绛栫暐 4锛氬墠缂€閫掑噺 fallback (80 鈫?50 鈫?30 鈫?20) 鈹€鈹€
            for (const prefixLen of [80, 50, 30, 20]) {
                // 鍘熸潵鐨?4a (鍘熷鍓嶇紑 indexOf) 琚Щ闄わ紝鍥犱负瀹冨湪鎴柇鍚庢瀬鏄撳彂鐢熼敊閰嶏紙渚嬪鍖归厤鍒扮涓€鏉＄殑 "1銆?锛?                // 浠呬繚鐣欏熀浜庡綊涓€鍖栨枃妗ｆ爲鐨?4b 鍜?4c锛屽畠浠洿涓ヨ皑骞朵笖鍖呭惈鍘熸湁鐨勪綅缃俊鎭槧灏勮绠?
                // 4b: cleanForSearch 鍓嶇紑
                {
                    const r = normPrefixSearch(
                        getCleanFull(), getCleanSearch(),
                        prefixLen, searchText.length, fullText.length,
                    );
                    if (r) {
                        console.log(`[WPS findRange] 绛栫暐4b鍛戒腑 (clean鍓嶇紑${prefixLen}), text: "${searchText.slice(0, 40)}..."`);
                        return hit(r);
                    }
                }

                // 4c: stripAllPunct 鍓嶇紑
                {
                    const r = normPrefixSearch(
                        getPunctFull(), getPunctSearch(),
                        prefixLen, searchText.length, fullText.length,
                    );
                    if (r) {
                        console.log(`[WPS findRange] 绛栫暐4c鍛戒腑 (noPunct鍓嶇紑${prefixLen}), text: "${searchText.slice(0, 40)}..."`);
                        return hit(r);
                    }
                }
            }

            // 鈹€鈹€ 绛栫暐 5锛氫腑娈垫悳绱紙鍙栦腑闂?30 瀛楃锛岀敤浜庡墠缂€/鍚庣紑鍧囧凡鏀瑰彉鐨勯噸搴︿慨鏀瑰満鏅級 鈹€鈹€
            {
                const cs = getCleanSearch();
                if (cs.text.length > 60) {
                    const midStart = Math.floor(cs.text.length / 2) - 15;
                    const midText = cs.text.slice(midStart, midStart + 30).trim();
                    if (midText.length >= 10) {
                        const cf = getCleanFull();
                        const midIdx = cf.text.indexOf(midText);
                        if (midIdx !== -1) {
                            // Calculate match index in normalized coordinate, then map back to original text.
                            const fullMatchIdx = midIdx - midStart;
                            if (fullMatchIdx >= 0 && fullMatchIdx < cf.map.length) {
                                const estStart = cf.map[fullMatchIdx]!;

                                // 鍚岀悊璁＄畻缁撴潫绱㈠紩
                                const estEndNormIdx = fullMatchIdx + cs.text.length - 1;
                                let estEnd: number;
                                if (estEndNormIdx >= 0 && estEndNormIdx < cf.map.length) {
                                    estEnd = cf.map[estEndNormIdx]! + 1;
                                } else {
                                    estEnd = Math.min(fullText!.length, estStart + searchText.length);
                                }

                                console.log(`[WPS findRange] strategy5 hit, text: "${searchText.slice(0, 40)}..."`);
                                return hit({ start: estStart, end: estEnd });
                            }
                        }
                    }
                }
            }

            // 鈹€鈹€ 绛栫暐 6锛欰PI Find.Execute 鍏滃簳 鈹€鈹€
            if (searchText.length <= 200) {
                try {
                    const searchRange = doc.Content;
                    if ((searchRange.Find as any).Execute(searchText)) {
                        console.log(`[WPS findRange] 绛栫暐6鍛戒腑 (Find.Execute), text: "${searchText.slice(0, 40)}..."`);
                        return hit({ start: searchRange.Start, end: searchRange.End });
                    }
                } catch { /* Find.Execute 涓嶅彲鐢?*/ }
            }

            console.warn(
                `[WPS findRange] 鍏ㄩ儴 6 涓瓥鐣ュ潎澶辫触, text: "${searchText.slice(0, 60)}${searchText.length > 60 ? '...' : ''}"`,
            );
        } catch (err) {
            console.error('[WPS findRange] 寮傚父:', err);
        }

        return null;
    }
}






