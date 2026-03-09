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
    const containsBonus = c.includes(t) ? 1.2 : (t.includes(c) ? 0.6 : 0);
    const lenPenalty = Math.abs(c.length - t.length) / Math.max(t.length, 1);

    return prefixRatio * 3 + containsBonus - lenPenalty;
}

interface AnchorPack {
    compact: string;
    head: string;
    tail: string;
    mid: string;
    marker: string;
}

function extractLeadingMarker(t: string): string {
    const s = t.replace(/[\r\n]+/g, ' ').trim();
    if (!s) return '';

    const m = s.match(
        /^(第[一二三四五六七八九十百千万零〇0-9]+条|[（(]?[0-9一二三四五六七八九十]+[）)]?[、.．]?|[0-9]+[、.．])/,
    );
    return (m?.[0] ?? '').replace(/\s+/g, '');
}

function markerMatchedNearStart(candidateText: string, marker: string): boolean {
    if (!marker) return true;
    const c = candidateText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, '');
    if (!c) return false;
    const idx = c.indexOf(marker);
    return idx >= 0 && idx <= 18;
}

function buildAnchors(targetText: string): AnchorPack {
    const compact = compactForCompare(targetText);
    const anchorLen = Math.min(48, Math.max(12, Math.floor(compact.length * 0.2)));
    const midLen = Math.min(32, Math.max(12, Math.floor(compact.length * 0.16)));
    const midStart = Math.max(0, Math.floor((compact.length - midLen) / 2));
    return {
        compact,
        head: compact.slice(0, anchorLen),
        tail: compact.slice(Math.max(0, compact.length - anchorLen)),
        mid: compact.slice(midStart, midStart + midLen),
        marker: extractLeadingMarker(targetText),
    };
}

function hasAnchor(candidateText: string, anchor: string): boolean {
    if (!anchor || anchor.length < 6) return true;
    return compactForCompare(candidateText).includes(anchor);
}

function calcCoverageScoreWithAnchors(candidateText: string, targetText: string, anchors: AnchorPack): number {
    const headBonus = hasAnchor(candidateText, anchors.head) ? 1.1 : -0.8;
    const tailBonus = hasAnchor(candidateText, anchors.tail) ? 1.1 : -0.8;
    const markerBonus = anchors.marker
        ? (markerMatchedNearStart(candidateText, anchors.marker) ? 0.45 : -0.35)
        : 0;
    return calcTextScore(candidateText, targetText) + headBonus + tailBonus + markerBonus;
}

function trimQuery(q: string, maxLen = 255): string {
    const s = q.trim();
    if (!s) return '';
    return s.length <= maxLen ? s : s.slice(0, maxLen);
}

async function searchCandidates(
    context: Word.RequestContext,
    query: string,
    limit = 8,
    options?: {
        ignoreSpace?: boolean;
        ignorePunct?: boolean;
    }
): Promise<Word.Range[]> {
    const q = trimQuery(query);
    if (q.length < 2) return [];

    const results = context.document.body.search(q, {
        matchCase: false,
        matchWholeWord: false,
        ignoreSpace: options?.ignoreSpace ?? true,
        ignorePunct: options?.ignorePunct ?? true,
    });
    results.load('items');
    await context.sync();
    if (results.items.length === 0) return [];

    const candidates = results.items.slice(0, limit);
    for (const r of candidates) {
        r.load('text');
    }
    await context.sync();
    return candidates;
}

function pickBestCandidate(
    candidates: Word.Range[],
    targetText: string,
    anchors: AnchorPack
): { best: Word.Range | null; score: number } {
    let best: Word.Range | null = null;
    let bestScore = -Infinity;

    for (const r of candidates) {
        const score = calcCoverageScoreWithAnchors(r.text || '', targetText, anchors);
        if (score > bestScore) {
            bestScore = score;
            best = r;
        }
    }
    return { best, score: bestScore };
}

interface RangeAcceptancePolicy {
    minScore: number;
    minLenRatio: number;
    requireBothAnchors: boolean;
    requireMarkerIfPresent: boolean;
}

interface FinalizedCandidate {
    range: Word.Range;
    score: number;
    accepted: boolean;
}

function evaluateRangeText(
    candidateText: string,
    targetText: string,
    anchors: AnchorPack
): {
    score: number;
    lenRatio: number;
    bothAnchors: boolean;
    markerMatch: boolean;
} {
    const score = calcCoverageScoreWithAnchors(candidateText, targetText, anchors);
    const compactLen = compactForCompare(candidateText).length;
    const targetLen = Math.max(1, anchors.compact.length);
    const lenRatio = compactLen / targetLen;
    const bothAnchors = hasAnchor(candidateText, anchors.head) && hasAnchor(candidateText, anchors.tail);
    const markerMatch = markerMatchedNearStart(candidateText, anchors.marker);
    return { score, lenRatio, bothAnchors, markerMatch };
}

async function ensureCoverageFast(
    context: Word.RequestContext,
    baseRange: Word.Range,
    targetText: string,
    originalTextLength: number,
    anchorsParam?: AnchorPack
): Promise<Word.Range> {
    const anchors = anchorsParam ?? buildAnchors(targetText);
    if (anchors.compact.length < 24) return baseRange;

    let currentRange = baseRange;
    currentRange.load('text');
    await context.sync();

    let bestRange = currentRange;
    let bestScore = calcCoverageScoreWithAnchors(currentRange.text || '', targetText, anchors);
    let startPara = currentRange.paragraphs.getFirst();
    let endPara = currentRange.paragraphs.getLast();

    const maxExpandSteps = 4;
    for (let step = 0; step < maxExpandSteps; step++) {
        const currentText = currentRange.text || '';
        const hasHead = hasAnchor(currentText, anchors.head);
        const hasTail = hasAnchor(currentText, anchors.tail);
        const compactLen = compactForCompare(currentText).length;

        if (hasHead && hasTail && compactLen >= Math.floor(anchors.compact.length * 0.92)) {
            return currentRange;
        }

        let expanded = false;
        const prev = !hasHead ? startPara.getPreviousOrNullObject() : null;
        const next = !hasTail ? endPara.getNextOrNullObject() : null;
        if (prev) prev.load('isNullObject');
        if (next) next.load('isNullObject');
        if (prev || next) {
            await context.sync();
        }
        if (prev && !prev.isNullObject) {
            startPara = prev;
            expanded = true;
        }
        if (next && !next.isNullObject) {
            endPara = next;
            expanded = true;
        }

        if (!expanded) break;

        const nextRange = startPara.getRange().expandTo(endPara.getRange());
        nextRange.load('text');
        await context.sync();

        const nextText = nextRange.text || '';
        const nextCompactLen = compactForCompare(nextText).length;
        if (nextCompactLen > Math.max(160, Math.floor(originalTextLength * 3.1))) {
            break;
        }

        const score = calcCoverageScoreWithAnchors(nextText, targetText, anchors);
        if (score > bestScore) {
            bestScore = score;
            bestRange = nextRange;
        }
        currentRange = nextRange;
    }

    return bestRange;
}

async function finalizeCandidate(
    context: Word.RequestContext,
    best: Word.Range | null,
    targetText: string,
    originalTextLength: number,
    anchors: AnchorPack,
    policy: RangeAcceptancePolicy
): Promise<FinalizedCandidate | null> {
    if (!best) return null;
    const covered = await ensureCoverageFast(context, best, targetText, originalTextLength, anchors);
    covered.load('text');
    await context.sync();

    const text = covered.text || '';
    const metrics = evaluateRangeText(text, targetText, anchors);
    const accepted =
        metrics.score >= policy.minScore &&
        metrics.lenRatio >= policy.minLenRatio &&
        (!policy.requireBothAnchors || metrics.bothAnchors) &&
        (!policy.requireMarkerIfPresent || !anchors.marker || metrics.markerMatch);

    return {
        range: covered,
        score: metrics.score,
        accepted,
    };
}

async function tryAnchorFusion(
    context: Word.RequestContext,
    targetText: string,
    anchors: AnchorPack
): Promise<Word.Range | null> {
    if (anchors.compact.length < 28 || anchors.head.length < 10 || anchors.tail.length < 10) {
        return null;
    }

    const headQuery = anchors.head.slice(0, Math.min(32, anchors.head.length));
    const tailQuery = anchors.tail.slice(Math.max(0, anchors.tail.length - Math.min(32, anchors.tail.length)));
    const headCandidates = await searchCandidates(context, headQuery, 5);
    if (headCandidates.length === 0) return null;

    const tailCandidates = await searchCandidates(context, tailQuery, 5);
    if (tailCandidates.length === 0) return null;

    const mergedRanges: Word.Range[] = [];
    for (const h of headCandidates) {
        for (const t of tailCandidates) {
            try {
                const merged = h.expandTo(t);
                merged.load('text');
                mergedRanges.push(merged);
            } catch {
                // ignore invalid pair
            }
        }
    }
    if (mergedRanges.length === 0) return null;

    await context.sync();

    let best: Word.Range | null = null;
    let bestScore = -Infinity;
    for (const r of mergedRanges) {
        const text = r.text || '';
        const compact = compactForCompare(text);
        if (!compact) continue;

        const lenPenalty =
            Math.abs(compact.length - anchors.compact.length) / Math.max(anchors.compact.length, 1);
        const bothAnchors = hasAnchor(text, anchors.head) && hasAnchor(text, anchors.tail);
        const score =
            calcCoverageScoreWithAnchors(text, targetText, anchors) - lenPenalty * 0.9 + (bothAnchors ? 0.8 : 0);

        if (score > bestScore) {
            bestScore = score;
            best = r;
        }
    }

    if (!best || bestScore < 0.6) return null;
    return best;
}

function makeProbeQueries(cleanText: string, noPunct: string, anchors: AnchorPack): string[] {
    const probes: string[] = [];

    if (cleanText.length > 255) {
        probes.push(cleanText.slice(0, 220));
    }
    if (noPunct.length >= 12 && noPunct !== cleanText) {
        probes.push(noPunct.slice(0, 220));
    }
    if (anchors.mid.length >= 12) {
        probes.push(anchors.mid);
    }
    if (anchors.head.length >= 12) {
        probes.push(anchors.head.slice(0, Math.min(24, anchors.head.length)));
    }
    if (anchors.tail.length >= 12) {
        probes.push(anchors.tail.slice(Math.max(0, anchors.tail.length - 24)));
    }

    const uniq = new Set<string>();
    const out: string[] = [];
    for (const p of probes) {
        const q = trimQuery(p);
        if (q.length < 2 || uniq.has(q)) continue;
        uniq.add(q);
        out.push(q);
    }
    return out;
}

function makeStrictQueries(rawText: string): string[] {
    const oneLine = rawText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!oneLine) return [];

    const queries: string[] = [];
    if (oneLine.length <= 255) {
        queries.push(oneLine);
    } else {
        queries.push(oneLine.slice(0, 220));
        queries.push(oneLine.slice(Math.max(0, oneLine.length - 220)));
    }

    if (oneLine.length > 180) {
        queries.push(oneLine.slice(0, 140));
    }

    const uniq = new Set<string>();
    const out: string[] = [];
    for (const q of queries) {
        const s = trimQuery(q, 255);
        if (s.length < 16 || uniq.has(s)) continue;
        uniq.add(s);
        out.push(s);
    }
    return out;
}

async function tryTableFallback(
    context: Word.RequestContext,
    text: string
): Promise<Word.Range | null> {
    if (!text.includes('|')) return null;

    try {
        const keyword = compactForCompare(text);
        if (keyword.length < 2) return null;

        const tables = context.document.body.tables;
        tables.load('items');
        await context.sync();
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
    } catch {
        // ignore
    }

    return null;
}

export async function resolveWordRange(
    context: Word.RequestContext,
    ref: WordRangeRef
): Promise<Word.Range | null> {
    const text = ref.searchText.trim();
    if (!text) return null;

    const cleanText = cleanForSearch(text);
    const noPunct = stripAllPunct(text);
    const originalLen = Math.max(1, text.length);
    const targetText = cleanText || text;
    const anchors = buildAnchors(targetText);
    const isLongTarget = anchors.compact.length >= 80;

    const strictPolicy: RangeAcceptancePolicy = {
        minScore: isLongTarget ? 1.1 : 0.7,
        minLenRatio: isLongTarget ? 0.72 : 0.56,
        requireBothAnchors: isLongTarget,
        requireMarkerIfPresent: isLongTarget,
    };
    const fuzzyPolicy: RangeAcceptancePolicy = {
        minScore: isLongTarget ? 0.95 : 0.62,
        minLenRatio: isLongTarget ? 0.68 : 0.52,
        requireBothAnchors: isLongTarget,
        requireMarkerIfPresent: false,
    };
    const probePolicy: RangeAcceptancePolicy = {
        minScore: isLongTarget ? 1.2 : 0.78,
        minLenRatio: isLongTarget ? 0.76 : 0.56,
        requireBothAnchors: isLongTarget,
        requireMarkerIfPresent: isLongTarget,
    };
    const fallbackFloor = isLongTarget ? 0.78 : 0.38;

    let bestFallback: FinalizedCandidate | null = null;

    // 1) Strict queries first (punctuation/space-sensitive) to reduce wrong clause matches.
    const strictQueries = makeStrictQueries(text);
    for (const sq of strictQueries.slice(0, 2)) {
        const strictCandidates = await searchCandidates(context, sq, 6, {
            ignoreSpace: false,
            ignorePunct: false,
        });
        if (strictCandidates.length > 0) {
            const { best } = pickBestCandidate(strictCandidates, targetText, anchors);
            const finalized = await finalizeCandidate(
                context,
                best,
                targetText,
                originalLen,
                anchors,
                strictPolicy
            );
            if (finalized && (!bestFallback || finalized.score > bestFallback.score)) {
                bestFallback = finalized;
            }
            if (finalized?.accepted) {
                return finalized.range;
            }
        }
    }

    // 2) Full-text fuzzy search when query length is supported.
    if (cleanText.length > 0 && cleanText.length <= 255) {
        const exactCandidates = await searchCandidates(context, cleanText, 6);
        if (exactCandidates.length > 0) {
            const { best } = pickBestCandidate(exactCandidates, targetText, anchors);
            const finalized = await finalizeCandidate(
                context,
                best,
                targetText,
                originalLen,
                anchors,
                fuzzyPolicy
            );
            if (finalized && (!bestFallback || finalized.score > bestFallback.score)) {
                bestFallback = finalized;
            }
            if (finalized?.accepted) {
                return finalized.range;
            }
        }
    }

    // 3) Anchor-fusion search: combine head & tail matches to avoid partial selection.
    const fused = await tryAnchorFusion(context, targetText, anchors);
    if (fused) {
        const finalized = await finalizeCandidate(
            context,
            fused,
            targetText,
            originalLen,
            anchors,
            fuzzyPolicy
        );
        if (finalized && (!bestFallback || finalized.score > bestFallback.score)) {
            bestFallback = finalized;
        }
        if (finalized?.accepted) {
            return finalized.range;
        }
    }

    // 4) Probe fallbacks (short list, performance-first).
    const probes = makeProbeQueries(cleanText, noPunct, anchors);
    for (const probe of probes.slice(0, 3)) {
        const candidates = await searchCandidates(context, probe, 6);
        if (candidates.length === 0) continue;
        const { best } = pickBestCandidate(candidates, targetText, anchors);
        const finalized = await finalizeCandidate(
            context,
            best,
            targetText,
            originalLen,
            anchors,
            probePolicy
        );
        if (finalized && (!bestFallback || finalized.score > bestFallback.score)) {
            bestFallback = finalized;
        }
        if (finalized?.accepted) {
            return finalized.range;
        }
    }

    if (bestFallback && bestFallback.score >= fallbackFloor) {
        return bestFallback.range;
    }

    // 5) Table fallback (only for explicit table-style text).
    const tableRange = await tryTableFallback(context, text);
    if (tableRange) return tableRange;

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
