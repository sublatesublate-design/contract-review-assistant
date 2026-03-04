/**
 * platform/issueActions.ts
 * 平台无关的 Issue 操作逻辑，供 IssueCard 和批量操作共用
 * 接受 IPlatformAdapter 而非 Word.RequestContext
 */

import type { ReviewIssue } from '../types/review';
import type { IPlatformAdapter, PlatformRange } from './types';

const RISK_LABEL: Record<ReviewIssue['riskLevel'], string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    info: '建议',
};

/**
 * 内存缓存：issue.id → PlatformRange
 * 避免每次操作都重新扫描全文 (findRange 是最耗时的步骤)
 * Key 格式: `${platform}:${issueId}` 以防跨平台串用
 */
const rangeCache = new Map<string, PlatformRange>();

function getCacheKey(adapter: IPlatformAdapter, issueId: string): string {
    return `${adapter.platform}:${issueId}`;
}

/** 获取 Range，优先从缓存中取，缓存未命中时调用 findRange 并存入缓存 */
async function getRange(
    adapter: IPlatformAdapter,
    issue: ReviewIssue,
    overrideText?: string
): Promise<PlatformRange | null> {
    const key = getCacheKey(adapter, issue.id);

    // 只有精确搜索（使用 originalText）时才使用缓存
    if (!overrideText && rangeCache.has(key)) {
        return rangeCache.get(key)!;
    }

    const searchText = overrideText ?? issue.originalText;
    const range = await adapter.rangeMapper.findRange(searchText);
    if (range && !overrideText) {
        rangeCache.set(key, range);
    }
    return range;
}

/** 清除某个 Issue 的 Range 缓存（文档内容被修改后需要失效） */
export function invalidateRangeCache(adapter: IPlatformAdapter, issueId: string): void {
    rangeCache.delete(getCacheKey(adapter, issueId));
}

/** 清除所有缓存（切换文档或重新审查时调用） */
export function clearAllRangeCache(): void {
    rangeCache.clear();
}

/** 在文档中定位到问题原文 */
export async function locateIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRange(adapter, issue);
    if (!range) return false;
    await adapter.navigationHelper.navigateAndHighlight(range);
    return true;
}

/** 为问题添加批注 */
export async function commentIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRange(adapter, issue);
    if (!range) return false;
    const riskLabel = RISK_LABEL[issue.riskLevel];
    const commentText = `[${riskLabel}] ${issue.title}\n${issue.description}${issue.legalBasis ? `\n法律依据：${issue.legalBasis}` : ''}`;
    await adapter.commentManager.addComment(range, commentText);
    return true;
}

/** 应用 AI 建议修改（生成修订标记） */
export async function applyIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    if (!issue.suggestedText) return false;
    const range = await getRange(adapter, issue);
    if (!range) return false;
    await adapter.trackChangesManager.applySuggestedEdit(range, issue.suggestedText);
    // 应用修改后文档文本已变化，使缓存失效，下次取消时需要重新定位
    invalidateRangeCache(adapter, issue.id);
    return true;
}

/** 撤销问题批注 */
export async function uncommentIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await getRange(adapter, issue);
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
    // 应用修改后 originalText 可能已被替换为 suggestedText，先尝试找 suggestedText
    let range = issue.suggestedText ? await getRange(adapter, issue, issue.suggestedText) : null;
    if (!range) {
        range = await getRange(adapter, issue);
    }
    if (!range) return false;
    await adapter.trackChangesManager.revertEdit(range, issue.originalText, issue.suggestedText);
    // 撤销后文本恢复，使缓存失效使下次操作重新定位
    invalidateRangeCache(adapter, issue.id);
    return true;
}

/** 批量添加批注 */
export async function batchComment(
    adapter: IPlatformAdapter,
    issues: ReviewIssue[],
    onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        if (!issue) continue;
        try {
            const ok = await commentIssue(adapter, issue);
            ok ? success++ : failed++;
        } catch {
            failed++;
        }
        onProgress?.(i + 1, issues.length);
    }
    return { success, failed };
}

/** 批量应用修改建议 */
export async function batchApply(
    adapter: IPlatformAdapter,
    issues: ReviewIssue[],
    onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number }> {
    const applicableIssues = issues.filter((i) => i.suggestedText && i.status !== 'applied');
    let success = 0;
    let failed = 0;
    const total = applicableIssues.length;
    if (total === 0) return { success: 0, failed: 0 };

    for (let i = 0; i < applicableIssues.length; i++) {
        const issue = applicableIssues[i];
        if (!issue) continue;
        try {
            const ok = await applyIssue(adapter, issue);
            ok ? success++ : failed++;
        } catch {
            failed++;
        }
        onProgress?.(i + 1, total);
    }
    return { success, failed };
}
