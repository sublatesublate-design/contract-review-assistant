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

function normalizeQuery(text?: string): string {
    return (text || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
        .split(/\.{3,}|…+/)
        .map((s) => normalizeQuery(s))
        .filter((s) => s.length >= 14);
}

function splitBySentence(text: string): string[] {
    return text
        .split(/[。！？；;.!?]/)
        .map((s) => normalizeQuery(s))
        .filter((s) => s.length >= 20);
}

function buildFallbackLocateQueries(text?: string): string[] {
    const src = normalizeQuery(text);
    if (!src) return [];

    const queries: string[] = [];
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

    return queries;
}

function collectLocateQueries(adapter: IPlatformAdapter, texts: Array<string | undefined>): string[] {
    const perTextLimit = adapter.platform === 'wps' ? 3 : 6;
    const totalLimit = adapter.platform === 'wps' ? 7 : 14;
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
    texts: Array<string | undefined>
): Promise<PlatformRange | null> {
    const queries = collectLocateQueries(adapter, texts);
    for (const query of queries) {
        const range = await adapter.rangeMapper.findRange(query);
        if (range) return range;
    }
    return null;
}

async function getRange(
    adapter: IPlatformAdapter,
    issue: ReviewIssue,
    options?: {
        overrideText?: string;
        includeSuggestedFallback?: boolean;
    }
): Promise<PlatformRange | null> {
    const texts: Array<string | undefined> = [];

    if (options?.overrideText) {
        texts.push(options.overrideText);
    } else {
        texts.push(issue.originalText);
    }

    if (options?.includeSuggestedFallback) {
        texts.push(issue.suggestedText);
    }

    return findRangeByTexts(adapter, texts);
}

function buildCommentText(issue: ReviewIssue): string {
    const riskLabel = RISK_LABEL[issue.riskLevel];
    const prefix = issue.category === 'missing_clause' ? '[缺失条款] ' : '';
    const suggested = issue.category === 'missing_clause' && issue.suggestedText
        ? `\n建议补充内容：\n${issue.suggestedText}`
        : '';

    return `${prefix}[${riskLabel}] ${issue.title}\n${issue.description}${issue.legalBasis ? `\n法律依据：${issue.legalBasis}` : ''}${suggested}`;
}

export function invalidateRangeCache(adapter: IPlatformAdapter, _issueId: string): void {
    adapter.invalidateMappingCache?.();
}

export function clearAllRangeCache(adapter?: IPlatformAdapter): void {
    adapter?.invalidateMappingCache?.();
}

/** 在文档中定位到问题原文 */
export async function locateIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRange(adapter, issue, { includeSuggestedFallback: true });
    if (!range) return false;
    await adapter.navigationHelper.navigateAndHighlight(range);
    return true;
}

/** 为问题添加批注 */
export async function commentIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRange(adapter, issue, { includeSuggestedFallback: true });
    if (!range) return false;
    await adapter.commentManager.addComment(range, buildCommentText(issue));
    return true;
}

/** 应用 AI 建议修改（生成修订标记） */
export async function applyIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    if (!issue.suggestedText) return false;
    const range = await getRange(adapter, issue, { includeSuggestedFallback: false });
    if (!range) return false;

    await adapter.trackChangesManager.applySuggestedEdit(range, issue.suggestedText);
    invalidateRangeCache(adapter, issue.id);
    return true;
}

/** 撤销问题批注 */
export async function uncommentIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRange(adapter, issue, { includeSuggestedFallback: true });
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
    let range = issue.suggestedText
        ? await getRange(adapter, issue, { overrideText: issue.suggestedText, includeSuggestedFallback: false })
        : null;

    if (!range) {
        range = await getRange(adapter, issue, { includeSuggestedFallback: true });
    }

    if (!range && adapter.platform === 'word') {
        const fallbackSearchText = normalizeQuery(issue.suggestedText || issue.originalText || '');
        if (fallbackSearchText) {
            range = {
                _internal: { searchText: fallbackSearchText },
                _platform: 'word',
            } as PlatformRange;
        }
    }

    if (!range) return false;

    try {
        await uncommentIssue(adapter, issue);
    } catch {
        // comment may not exist, continue reverting changes.
    }

    await adapter.trackChangesManager.revertEdit(range, issue.originalText, issue.suggestedText);
    invalidateRangeCache(adapter, issue.id);
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

    const prepared: Array<{ index: number; range: PlatformRange; text: string }> = [];
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

        const range = await getRange(adapter, issue, { includeSuggestedFallback: true });
        if (!range) {
            failed++;
            progressSent[i] = true;
            onProgress?.(i + 1, total, false);
            continue;
        }

        prepared.push({
            index: i,
            range,
            text: buildCommentText(issue),
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
                if (ok) success++;
                else failed++;

                if (!progressSent[preparedItem.index]) {
                    progressSent[preparedItem.index] = true;
                    onProgress?.(preparedItem.index + 1, total, ok);
                }
            }
        } catch (err) {
            console.error('[batchComment] 批量插入批注失败:', err);
            for (const preparedItem of prepared) {
                failed++;
                if (!progressSent[preparedItem.index]) {
                    progressSent[preparedItem.index] = true;
                    onProgress?.(preparedItem.index + 1, total, false);
                }
            }
        }
    }

    return { success, failed };
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
                ok = await applyIssue(adapter, issue);
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
        if (!issue || !issue.suggestedText) {
            failed++;
            onProgress?.(i + 1, total, false);
            continue;
        }

        const range = await getRange(adapter, issue, { includeSuggestedFallback: false });
        if (!range) {
            failed++;
            onProgress?.(i + 1, total, false);
            continue;
        }

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
                invalidateRangeCache(adapter, item.issueId);
            } else {
                failed++;
            }
            onProgress?.(item.index + 1, total, ok);
        }
    } catch {
        for (const item of prepared) {
            failed++;
            onProgress?.(item.index + 1, total, false);
        }
    }

    return { success, failed };
}
