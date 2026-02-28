/**
 * platform/issueActions.ts
 * 平台无关的 Issue 操作逻辑，供 IssueCard 和批量操作共用
 * 接受 IPlatformAdapter 而非 Word.RequestContext
 */

import type { ReviewIssue } from '../types/review';
import type { IPlatformAdapter } from './types';

const RISK_LABEL: Record<ReviewIssue['riskLevel'], string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    info: '建议',
};

/** 在文档中定位到问题原文 */
export async function locateIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await adapter.rangeMapper.findRange(issue.originalText);
    if (!range) return false;
    await adapter.navigationHelper.navigateAndHighlight(range);
    return true;
}

/** 为问题添加批注 */
export async function commentIssue(
    adapter: IPlatformAdapter,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await adapter.rangeMapper.findRange(issue.originalText);
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
    const range = await adapter.rangeMapper.findRange(issue.originalText);
    if (!range) return false;
    await adapter.trackChangesManager.applySuggestedEdit(range, issue.suggestedText);
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
