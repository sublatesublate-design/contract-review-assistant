/**
 * platform/issueActions.ts
 * Platform-agnostic issue actions used by IssueCard and batch operations.
 */

import type { ReviewIssue } from '../types/review';
import type { IPlatformAdapter, PlatformRange } from './types';

const RISK_LABEL: Record<ReviewIssue['riskLevel'], string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    info: '建议',
};

const MIN_PROBE_LEN = 10;
const ISSUE_RANGE_CACHE_TTL_MS = 120000;

type QueryBudget = 'compact' | 'full';

interface CachedIssueRange {
    range: PlatformRange;
    platform: IPlatformAdapter['platform'];
    mutationVersion: number;
    savedAt: number;
}

const issueRangeCache = new Map<string, CachedIssueRange>();
let rangeMutationVersion = 0;

interface WpsBatchGuard {
    app: any | null;
    previousScreenUpdating?: boolean;
}

async function beginWpsBatchOptimization(adapter: IPlatformAdapter): Promise<WpsBatchGuard> {
    if (adapter.platform !== 'wps') {
        return { app: null };
    }

    await adapter.rangeMapper.preloadFullText?.();

    if (typeof window === 'undefined') {
        return { app: null };
    }

    const wpsApi = (window as any).wps;
    if (!wpsApi?.WpsApplication) {
        return { app: null };
    }

    const app = wpsApi.WpsApplication();
    try {
        const previous = app.ScreenUpdating;
        app.ScreenUpdating = false;
        return { app, previousScreenUpdating: previous };
    } catch {
        return { app };
    }
}

function endWpsBatchOptimization(guard: WpsBatchGuard): void {
    if (!guard.app) return;
    if (typeof guard.previousScreenUpdating !== 'boolean') return;
    try {
        guard.app.ScreenUpdating = guard.previousScreenUpdating;
    } catch {
        // ignore restore failure
    }
}

function normalizeQuery(text?: string): string {
    return (text || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function pushUniqueText(target: string[], value?: string): void {
    const normalized = (value || '').trim();
    if (!normalized) return;
    if (!target.includes(normalized)) {
        target.push(normalized);
    }
}

function stripLeadingLocateLabel(text: string): string {
    return text.replace(
        /^\s*(缺失条款所在原文|缺失条款原文|合同原文|原文|条款原文|原条款|条款)\s*[:：]\s*/,
        ''
    ).trim();
}

function stripOuterQuotes(text: string): string {
    return text
        .replace(/^[\s"'`“”‘’「『《（(【\[]+/, '')
        .replace(/[\s"'`“”‘’」』》）)】\]]+$/, '')
        .trim();
}

function stripBracketPairs(text: string): string {
    return text.replace(/[\u3010\u3011\[\]]/g, '').trim();
}

function stripLeadingClauseHeading(text: string): string {
    return text.replace(/^\s*\u7b2c[\u4e00-\u9fa5\d]+\u6761(?:\s+[\u4e00-\u9fa5]{1,20})?\s*/, '').trim();
}

function buildLocateTextVariants(text?: string): string[] {
    const base = (text || '').trim();
    if (!base) return [];

    const variants: string[] = [];
    const labelStripped = stripLeadingLocateLabel(base);
    const unquoted = stripOuterQuotes(labelStripped);
    const noBrackets = stripBracketPairs(unquoted);
    const noHeading = stripLeadingClauseHeading(unquoted);
    const noHeadingNoBrackets = stripLeadingClauseHeading(noBrackets);

    // Keep bracketed original first for WPS Find.Execute, then relaxed variants as fallback.
    pushUniqueText(variants, unquoted);
    pushUniqueText(variants, normalizeQuery(unquoted));
    pushUniqueText(variants, noBrackets);
    pushUniqueText(variants, normalizeQuery(noBrackets));
    pushUniqueText(variants, noHeading);
    pushUniqueText(variants, normalizeQuery(noHeading));
    pushUniqueText(variants, noHeadingNoBrackets);
    pushUniqueText(variants, normalizeQuery(noHeadingNoBrackets));
    pushUniqueText(variants, base);
    pushUniqueText(variants, normalizeQuery(base));

    return variants;
}

function uniquePush(target: string[], value: string, minLen = MIN_PROBE_LEN): void {
    const normalized = normalizeQuery(value);
    if (normalized.length < minLen) return;
    if (!target.includes(normalized)) {
        target.push(normalized);
    }
}

function splitByEllipsis(text: string): string[] {
    return text
        .split(/\.{3,}|\u2026+/)
        .map((s) => normalizeQuery(s))
        .filter((s) => s.length >= 14);
}

function splitBySentence(text: string): string[] {
    return text
        .split(/[。！？；;.!?]/)
        .map((s) => normalizeQuery(s))
        .filter((s) => s.length >= 20);
}

function hasEllipsis(text?: string): boolean {
    if (!text) return false;
    return /\.{3,}|\u2026+/.test(text);
}

function countClauseMarkers(text?: string): number {
    const src = normalizeQuery(text);
    if (!src) return 0;
    const matches = src.match(/第[一二三四五六七八九十百千万零〇\d]+条/g);
    return matches?.length ?? 0;
}

function isLikelyNonContiguousExcerpt(text?: string): boolean {
    const src = normalizeQuery(text);
    if (!src) return false;
    if (!hasEllipsis(src)) return false;

    if (countClauseMarkers(src) >= 2) {
        return true;
    }

    const longParts = splitByEllipsis(src).filter((p) => p.length >= 24);
    return longParts.length >= 2;
}

function cannotApplyAsSingleRange(issue: ReviewIssue): boolean {
    return isLikelyNonContiguousExcerpt(issue.originalText);
}

function buildFallbackLocateQueries(text?: string): string[] {
    const queries: string[] = [];
    const variants = buildLocateTextVariants(text);
    if (variants.length === 0) return queries;

    for (const variant of variants) {
        const raw = variant.trim();
        const src = normalizeQuery(variant);
        if (!src && !raw) continue;

        if (raw.length >= 2 && !queries.includes(raw)) {
            queries.push(raw);
        }
        uniquePush(queries, src, 2);

        const parts = splitByEllipsis(src);
        for (const p of parts) {
            uniquePush(queries, p);
        }

        if (parts.length >= 2) {
            const first = parts[0] || '';
            const last = parts[parts.length - 1] || '';
            uniquePush(queries, `${first.slice(0, 80)} ${last.slice(Math.max(0, last.length - 80))}`);
        }

        const sentenceParts = splitBySentence(src);
        for (const sentence of sentenceParts.slice(0, 3)) {
            uniquePush(queries, sentence);
        }

        if (src.length > 120) {
            const window = Math.min(180, src.length);
            uniquePush(queries, src.slice(0, window));

            const midStart = Math.max(0, Math.floor(src.length / 2) - Math.floor(window / 2));
            uniquePush(queries, src.slice(midStart, midStart + window));

            uniquePush(queries, src.slice(Math.max(0, src.length - window)));
        }

        const noPunct = src
            .replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (noPunct && noPunct !== src) {
            uniquePush(queries, noPunct.slice(0, 180));
        }
    }

    return queries;
}

function cloneRange(range: PlatformRange): PlatformRange {
    if (range._internal && typeof range._internal === 'object') {
        return {
            _platform: range._platform,
            _internal: { ...(range._internal as Record<string, unknown>) },
        } as PlatformRange;
    }

    return {
        _platform: range._platform,
        _internal: range._internal,
    } as PlatformRange;
}

function getCachedRange(adapter: IPlatformAdapter, issueId: string): PlatformRange | null {
    const hit = issueRangeCache.get(issueId);
    if (!hit) return null;

    if (hit.platform !== adapter.platform) {
        issueRangeCache.delete(issueId);
        return null;
    }

    if (hit.mutationVersion !== rangeMutationVersion) {
        issueRangeCache.delete(issueId);
        return null;
    }

    if (Date.now() - hit.savedAt > ISSUE_RANGE_CACHE_TTL_MS) {
        issueRangeCache.delete(issueId);
        return null;
    }

    return cloneRange(hit.range);
}

function setCachedRange(adapter: IPlatformAdapter, issueId: string, range: PlatformRange): void {
    issueRangeCache.set(issueId, {
        range: cloneRange(range),
        platform: adapter.platform,
        mutationVersion: rangeMutationVersion,
        savedAt: Date.now(),
    });
}

function bumpMutation(adapter: IPlatformAdapter): void {
    rangeMutationVersion += 1;
    issueRangeCache.clear();
    adapter.invalidateMappingCache?.();
}

function collectLocateQueries(
    adapter: IPlatformAdapter,
    texts: Array<string | undefined>,
    budget: QueryBudget
): string[] {
    const perTextLimit = budget === 'compact'
        ? (adapter.platform === 'wps' ? 4 : 3)
        : (adapter.platform === 'wps' ? 7 : 6);
    const totalLimit = budget === 'compact'
        ? (adapter.platform === 'wps' ? 8 : 6)
        : (adapter.platform === 'wps' ? 14 : 14);

    const all: string[] = [];

    for (const text of texts) {
        const candidates = buildFallbackLocateQueries(text);
        for (const candidate of candidates.slice(0, perTextLimit)) {
            uniquePush(all, candidate, 2);
            if (all.length >= totalLimit) return all;
        }
    }

    return all;
}

async function findRangeByTexts(
    adapter: IPlatformAdapter,
    texts: Array<string | undefined>,
    budget: QueryBudget,
    skipRefinement?: boolean
): Promise<{ range: PlatformRange; query: string } | null> {
    const queries = collectLocateQueries(adapter, texts, budget);

    if (adapter.platform === 'wps' && adapter.rangeMapper.findRangeFromCache) {
        await adapter.rangeMapper.preloadFullText?.();
        for (const query of queries) {
            const cached = adapter.rangeMapper.findRangeFromCache(query);
            if (cached) {
                return { range: cached, query };
            }
        }
    }

    const mapperOptions = skipRefinement ? { skipRefinement: true } : undefined;

    for (const query of queries) {
        const range = await adapter.rangeMapper.findRange(query, mapperOptions);
        if (range) {
            return { range, query };
        }
    }

    return null;
}

async function getRange(
    adapter: IPlatformAdapter,
    issue: ReviewIssue,
    options?: {
        overrideText?: string;
        includeSuggestedFallback?: boolean;
        useCache?: boolean;
        budget?: QueryBudget;
        skipRefinement?: boolean;
    }
): Promise<PlatformRange | null> {
    const allowCache = options?.useCache !== false;
    const budget = options?.budget ?? 'full';
    const useIssueCache = allowCache && !options?.overrideText;

    if (useIssueCache) {
        const cached = getCachedRange(adapter, issue.id);
        if (cached) return cached;
    }

    const directCandidates = buildLocateTextVariants(options?.overrideText ?? issue.originalText);

    if (adapter.platform === 'wps' && adapter.rangeMapper.findRangeFromCache) {
        await adapter.rangeMapper.preloadFullText?.();
        const cacheTake = budget === 'compact' ? 4 : 12;
        for (const candidate of directCandidates.slice(0, cacheTake)) {
            const cachedHit = adapter.rangeMapper.findRangeFromCache(candidate);
            if (cachedHit) {
                if (useIssueCache) {
                    setCachedRange(adapter, issue.id, cachedHit);
                }
                return cachedHit;
            }
        }
    }

    const directTake = budget === 'compact'
        ? (adapter.platform === 'wps' ? 3 : 1)
        : (adapter.platform === 'wps' ? 4 : 2);
    const directFindOptions = options?.skipRefinement ? { skipRefinement: true } : undefined;
    for (const candidate of directCandidates.slice(0, directTake)) {
        const direct = await adapter.rangeMapper.findRange(candidate, directFindOptions);
        if (direct) {
            if (useIssueCache) {
                setCachedRange(adapter, issue.id, direct);
            }
            return direct;
        }
    }

    const texts: Array<string | undefined> = [];

    if (options?.overrideText) {
        texts.push(options.overrideText);
    } else {
        texts.push(issue.originalText);
    }

    if (options?.includeSuggestedFallback) {
        texts.push(issue.suggestedText);
    }

    const found = await findRangeByTexts(adapter, texts, budget, options?.skipRefinement);
    if (!found) return null;

    if (useIssueCache) {
        setCachedRange(adapter, issue.id, found.range);
    }

    return found.range;
}

async function getRangeWithFallback(
    adapter: IPlatformAdapter,
    issue: ReviewIssue,
    options?: {
        overrideText?: string;
        includeSuggestedFallback?: boolean;
        useCache?: boolean;
        skipRefinement?: boolean;
    }
): Promise<PlatformRange | null> {
    if (adapter.platform === 'wps') {
        return getRange(adapter, issue, {
            ...options,
            budget: 'full',
        });
    }

    const compact = await getRange(adapter, issue, {
        ...options,
        budget: 'compact',
    });
    if (compact) return compact;

    return getRange(adapter, issue, {
        ...options,
        budget: 'full',
    });
}

function buildCommentText(issue: ReviewIssue): string {
    const riskLabel = RISK_LABEL[issue.riskLevel];
    const prefix = issue.category === 'missing_clause' ? '[缺失条款] ' : '';
    const suggested = issue.category === 'missing_clause' && issue.suggestedText
        ? `\n建议补充内容：\n${issue.suggestedText}`
        : '';

    return `${prefix}[${riskLabel}] ${issue.title}\n${issue.description}${issue.legalBasis ? `\n法律依据：${issue.legalBasis}` : ''}${suggested}`;
}

export function invalidateRangeCache(adapter: IPlatformAdapter, issueId: string): void {
    issueRangeCache.delete(issueId);
    adapter.invalidateMappingCache?.();
}

export function clearAllRangeCache(adapter?: IPlatformAdapter): void {
    rangeMutationVersion += 1;
    issueRangeCache.clear();
    adapter?.invalidateMappingCache?.();
}

/** 在文档中定位到问题原文 */
export async function locateIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRangeWithFallback(adapter, issue, {
        includeSuggestedFallback: true,
        useCache: true,
    });

    if (!range) return false;

    setCachedRange(adapter, issue.id, range);
    await adapter.navigationHelper.navigateAndHighlight(range);
    return true;
}

/** 为问题添加批注 */
export async function commentIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRangeWithFallback(adapter, issue, {
        includeSuggestedFallback: true,
        useCache: true,
    });

    if (!range) return false;

    setCachedRange(adapter, issue.id, range);
    await adapter.commentManager.addComment(range, buildCommentText(issue));
    return true;
}

/** 应用 AI 建议修改（生成修订标记） */
export async function applyIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue,
    options?: { skipRefinement?: boolean }
): Promise<boolean> {
    if (!issue.suggestedText) return false;

    // 跨条款拼接原文无法作为单一连续 range 替换，直接快速失败，避免长时间卡顿。
    if (cannotApplyAsSingleRange(issue)) {
        return false;
    }

    const range = await getRangeWithFallback(adapter, issue, {
        includeSuggestedFallback: false,
        useCache: true,
        ...(options?.skipRefinement ? { skipRefinement: true } : {}),
    });

    if (!range) return false;

    await adapter.trackChangesManager.applySuggestedEdit(range, issue.suggestedText);
    bumpMutation(adapter);
    return true;
}

/** 撤销问题批注 */
export async function uncommentIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRangeWithFallback(adapter, issue, {
        includeSuggestedFallback: true,
        useCache: true,
    });

    if (!range) return false;

    const riskLabel = RISK_LABEL[issue.riskLevel];
    const commentText = `[${riskLabel}] ${issue.title}`;
    await adapter.commentManager.removeComment(range, commentText);
    return true;
}

/** 撤销 AI 修改建议 */
export async function unapplyIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    if (cannotApplyAsSingleRange(issue)) {
        return false;
    }

    let range = issue.suggestedText
        ? await getRangeWithFallback(adapter, issue, {
            overrideText: issue.suggestedText,
            includeSuggestedFallback: false,
            useCache: false,
        })
        : null;

    if (!range) {
        range = await getRangeWithFallback(adapter, issue, {
            includeSuggestedFallback: true,
            useCache: false,
        });
    }

    if (!range && adapter.platform === 'word') {
        const fallbackCandidates = collectLocateQueries(
            adapter,
            [issue.suggestedText, issue.originalText],
            'compact'
        );
        const fallbackSearchText = normalizeQuery(fallbackCandidates[0]);

        if (fallbackSearchText) {
            range = {
                _internal: { searchText: fallbackSearchText },
                _platform: 'word',
            } as PlatformRange;
        }
    }

    if (!range) return false;

    // Use the same resolved range to remove comment first, avoid duplicate range resolution.
    try {
        const riskLabel = RISK_LABEL[issue.riskLevel];
        const commentText = `[${riskLabel}] ${issue.title}`;
        await adapter.commentManager.removeComment(range, commentText);
    } catch {
        // comment may not exist, continue reverting changes.
    }

    await adapter.trackChangesManager.revertEdit(range, issue.originalText, issue.suggestedText);
    bumpMutation(adapter);
    return true;
}

/** 批量添加批注 */
export async function batchComment(
    adapter: IPlatformAdapter,
    issues: ReviewIssue[],
    onProgress?: (done: number, total: number, lastSuccess: boolean) => void
): Promise<{ success: number; failed: number }> {
    const total = issues.length;
    if (total === 0) return { success: 0, failed: 0 };

    const wpsGuard = await beginWpsBatchOptimization(adapter);
    try {

    const prepared: Array<{ index: number; range: PlatformRange; text: string; issueId: string }> = [];
    const progressSent = Array<boolean>(total).fill(false);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
        const issue = issues[i];
        if (!issue) {
            failed++;
            progressSent[i] = true;
            onProgress?.(i + 1, total, false);
            continue;
        }

        const range = await getRangeWithFallback(adapter, issue, {
            includeSuggestedFallback: true,
            useCache: true,
            skipRefinement: true,
        });

        if (!range) {
            failed++;
            progressSent[i] = true;
            onProgress?.(i + 1, total, false);
            continue;
        }

        setCachedRange(adapter, issue.id, range);
        prepared.push({
            index: i,
            range,
            text: buildCommentText(issue),
            issueId: issue.id,
        });
    }

    if (prepared.length > 0) {
        try {
            const results = await adapter.commentManager.addBatchComments(
                prepared.map((item) => ({ range: item.range, text: item.text }))
            );

            for (let i = 0; i < prepared.length; i++) {
                const preparedItem = prepared[i];
                if (!preparedItem) continue;
                const ok = !!results[i];
                if (ok) {
                    success++;
                } else {
                    failed++;
                    issueRangeCache.delete(preparedItem.issueId);
                }

                if (!progressSent[preparedItem.index]) {
                    progressSent[preparedItem.index] = true;
                    onProgress?.(preparedItem.index + 1, total, ok);
                }
            }
        } catch (err) {
            console.error('[batchComment] 批量插入批注失败:', err);
            for (const preparedItem of prepared) {
                failed++;
                issueRangeCache.delete(preparedItem.issueId);
                if (!progressSent[preparedItem.index]) {
                    progressSent[preparedItem.index] = true;
                    onProgress?.(preparedItem.index + 1, total, false);
                }
            }
        }
    }

        return { success, failed };
    } finally {
        endWpsBatchOptimization(wpsGuard);
    }
}

/** 批量应用修改建议 */
export async function batchApply(
    adapter: IPlatformAdapter,
    issues: ReviewIssue[],
    onProgress?: (done: number, total: number, lastSuccess: boolean) => void
): Promise<{ success: number; failed: number }> {
    const applicableIssues = issues.filter((i) => i.suggestedText && i.status !== 'applied');
    const total = applicableIssues.length;
    if (total === 0) return { success: 0, failed: 0 };

    const wpsGuard = await beginWpsBatchOptimization(adapter);
    try {

    // WPS ranges are offset-based and can drift after each replacement.
    // Keep sequential locate+apply for WPS to avoid positional drift.
    if (adapter.platform === 'wps' || !adapter.trackChangesManager.applyBatchSuggestedEdits) {
        let success = 0;
        let failed = 0;

        for (let i = 0; i < total; i++) {
            const issue = applicableIssues[i];
            if (!issue) {
                failed++;
                onProgress?.(i + 1, total, false);
                continue;
            }

            let ok = false;
            try {
                ok = await applyIssue(adapter, issue, { skipRefinement: true });
            } catch {
                ok = false;
            }

            if (ok) success++;
            else failed++;
            onProgress?.(i + 1, total, ok);
        }

        return { success, failed };
    }

    // Word batch path: one run with track mode toggled once.
    const prepared: Array<{ index: number; range: PlatformRange; suggestedText: string; issueId: string }> = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
        const issue = applicableIssues[i];
        if (!issue || !issue.suggestedText || cannotApplyAsSingleRange(issue)) {
            failed++;
            onProgress?.(i + 1, total, false);
            continue;
        }

        const range = await getRangeWithFallback(adapter, issue, {
            includeSuggestedFallback: false,
            useCache: true,
            skipRefinement: true,
        });

        if (!range) {
            failed++;
            onProgress?.(i + 1, total, false);
            continue;
        }

        setCachedRange(adapter, issue.id, range);
        prepared.push({ index: i, range, suggestedText: issue.suggestedText, issueId: issue.id });
    }

    if (prepared.length === 0) return { success, failed };

    try {
        const results = await adapter.trackChangesManager.applyBatchSuggestedEdits(
            prepared.map((item) => ({ range: item.range, suggestedText: item.suggestedText }))
        );

        for (let i = 0; i < prepared.length; i++) {
            const item = prepared[i];
            if (!item) continue;
            const ok = !!results[i];
            if (ok) {
                success++;
            } else {
                failed++;
                issueRangeCache.delete(item.issueId);
            }
            onProgress?.(item.index + 1, total, ok);
        }

        if (success > 0) {
            bumpMutation(adapter);
        }
    } catch {
        for (const item of prepared) {
            failed++;
            issueRangeCache.delete(item.issueId);
            onProgress?.(item.index + 1, total, false);
        }
    }

        return { success, failed };
    } finally {
        endWpsBatchOptimization(wpsGuard);
    }
}
