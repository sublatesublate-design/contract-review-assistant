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
 * 获取 Range。
 * 废除原有的全局偏移量缓存！
 * 在 WPS 这类系统里，一旦文档产生插入、删除或格式变动，全文的所有偏移量立刻改变。
 * 把绝对偏移量(start, end)长时间缓存在内存里，会导致稍后再点击其它条款时选区疯狂漂移。
 */
async function getRange(
    adapter: IPlatformAdapter,
    issue: ReviewIssue,
    overrideText?: string
): Promise<PlatformRange | null> {
    const searchText = overrideText ?? issue.originalText;
    return await adapter.rangeMapper.findRange(searchText);
}

/** 
 * 接口保留以兼容老代码调用，但内部已不再需要维护易导致漂移的永久缓存
 */
export function invalidateRangeCache(adapter: IPlatformAdapter, issueId: string): void {
    // No-op
}

export function clearAllRangeCache(): void {
    // No-op
}

/** 在文档中定位到问题原文 */
export async function locateIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    let range = await getRange(adapter, issue);
    if (!range && issue.suggestedText) {
        // After applying revisions, originalText may no longer exist verbatim.
        range = await getRange(adapter, issue, issue.suggestedText);
    }
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
    const prefix = issue.category === 'missing_clause' ? '[缺失条款] ' : '';
    const suggested = issue.category === 'missing_clause' && issue.suggestedText ? `\n建议补充内容：\n${issue.suggestedText}` : '';
    const commentText = `${prefix}[${riskLabel}] ${issue.title}\n${issue.description}${issue.legalBasis ? `\n法律依据：${issue.legalBasis}` : ''}${suggested}`;
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

    // 统一使用替换语义：suggestedText 是 originalText 的完整替换版本
    // （包括 missing_clause —— originalText 为缺失条款所在的已有段落，
    //   suggestedText 为补充缺失条款后的完整段落）
    await adapter.trackChangesManager.applySuggestedEdit(range, issue.suggestedText);

    // 仅使当前 issue 的缓存失效
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
    if (!range && adapter.platform === 'word') {
        // Word revert has a global relevant-revision fallback, so allow entering revert flow.
        const fallbackSearchText = (issue.suggestedText || issue.originalText || '').trim();
        if (fallbackSearchText) {
            range = {
                _internal: { searchText: fallbackSearchText },
                _platform: 'word',
            } as PlatformRange;
        }
    }
    if (!range) return false;

    // 先移除可能存在的关联批注（必须在 revertEdit 之前执行！）
    // 原因：revertEdit 会触发 rejectAll 改变文档结构，之后 resolveWordRange 无法精确定位批注
    try {
        await uncommentIssue(adapter, issue);
    } catch {
        // 批注可能不存在或已被手动删除，静默忽略
    }

    // 再撤销修订（此时批注已清理完毕，rejectAll 不会影响批注查找）
    await adapter.trackChangesManager.revertEdit(range, issue.originalText, issue.suggestedText);

    // 仅使当前 issue 的缓存失效
    invalidateRangeCache(adapter, issue.id);

    return true;
}

/** 批量添加批注 */
export async function batchComment(
    adapter: IPlatformAdapter,
    issues: ReviewIssue[],
    onProgress?: (done: number, total: number, lastSuccess: boolean) => void
): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    const total = issues.length;

    // 先收集所有能成功查找到原文的 Issue 和对应的 Range
    const toComment: Array<{ range: PlatformRange; text: string; issueId: string }> = [];

    for (let i = 0; i < total; i++) {
        const issue = issues[i];
        if (!issue) continue;
        const range = await getRange(adapter, issue);
        if (range) {
            const riskLabel = RISK_LABEL[issue.riskLevel];
            const prefix = issue.category === 'missing_clause' ? '[缺失条款] ' : '';
            const suggested = issue.category === 'missing_clause' && issue.suggestedText ? `\n建议补充内容：\n${issue.suggestedText}` : '';
            const commentText = `${prefix}[${riskLabel}] ${issue.title}\n${issue.description}${issue.legalBasis ? `\n法律依据：${issue.legalBasis}` : ''}${suggested}`;
            toComment.push({ range, text: commentText, issueId: issue.id });
        } else {
            failed++;
            onProgress?.(i + 1, total, false);
        }
    }

    if (toComment.length > 0) {
        try {
            // 一次性调用底层平台的批量批注接口 (减少 Word.run 次数和重绘)
            await adapter.commentManager.addBatchComments(toComment);
            success = toComment.length;
            // 通知前端状态更新
            for (let i = 0; i < toComment.length; i++) {
                onProgress?.(failed + i + 1, total, true);
            }
        } catch (err) {
            console.error('[batchComment] 批量插入批注失败:', err);
            failed += toComment.length;
            for (let i = 0; i < toComment.length; i++) {
                onProgress?.(failed + i + 1, total, false);
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
    let success = 0;
    let failed = 0;
    const total = applicableIssues.length;
    if (total === 0) return { success: 0, failed: 0 };

    for (let i = 0; i < applicableIssues.length; i++) {
        const issue = applicableIssues[i];
        if (!issue) continue;
        let ok = false;
        try {
            // 复用单条 applyIssue（里面现在已经是单个 Word.run 或 WPS 缓存查找了）
            ok = await applyIssue(adapter, issue);
            ok ? success++ : failed++;
        } catch {
            failed++;
        }
        onProgress?.(i + 1, total, ok);
    }
    return { success, failed };
}
