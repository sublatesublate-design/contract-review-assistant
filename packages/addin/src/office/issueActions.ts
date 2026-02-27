/* global Word */

/**
 * issueActions.ts
 * 提取 ReviewIssue 的核心 Word 操作逻辑，供 IssueCard 和批量操作共用
 * 所有操作接受已打开的 Word.RequestContext，可在单个 Word.run 内批量调用
 */

import type { ReviewIssue } from '../types/review';
import { commentManager } from './commentManager';
import { trackChangesManager } from './trackChangesManager';
import { navigationHelper } from './navigationHelper';
import { rangeMapper } from './rangeMapper';

const RISK_LABEL: Record<ReviewIssue['riskLevel'], string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    info: '建议',
};

/**
 * 在文档中定位到问题原文，并选中高亮
 */
export async function locateIssue(
    context: Word.RequestContext,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await rangeMapper.findRange(context, issue.originalText);
    if (!range) return false;
    await navigationHelper.navigateToRange(context, range);
    return true;
}

/**
 * 为问题添加 Word 批注
 */
export async function commentIssue(
    context: Word.RequestContext,
    issue: ReviewIssue
): Promise<boolean> {
    const range = await rangeMapper.findRange(context, issue.originalText);
    if (!range) return false;
    const riskLabel = RISK_LABEL[issue.riskLevel];
    const commentText = `[${riskLabel}] ${issue.title}\n${issue.description}${issue.legalBasis ? `\n法律依据：${issue.legalBasis}` : ''}`;
    await commentManager.addComment(context, range, commentText);
    return true;
}

/**
 * 应用 AI 建议修改（生成修订标记）
 */
export async function applyIssue(
    context: Word.RequestContext,
    issue: ReviewIssue
): Promise<boolean> {
    if (!issue.suggestedText) return false;
    const range = await rangeMapper.findRange(context, issue.originalText);
    if (!range) return false;
    await trackChangesManager.applySuggestedEdit(context, range, issue.suggestedText);
    return true;
}

/**
 * 批量添加批注（在单个 Word.run 内执行，避免并发竞争）
 * @returns 成功处理的数量
 */
export async function batchComment(
    issues: ReviewIssue[],
    onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    const total = issues.length;

    await Word.run(async (context) => {
        for (let i = 0; i < issues.length; i++) {
            const issue = issues[i];
            if (!issue) continue;
            try {
                const ok = await commentIssue(context, issue);
                if (ok) success++;
                else failed++;
            } catch {
                failed++;
            }
            onProgress?.(i + 1, total);
        }
    });

    return { success, failed };
}

/**
 * 批量应用修改建议（在单个 Word.run 内执行）
 * @returns 成功处理的数量
 */
export async function batchApply(
    issues: ReviewIssue[],
    onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number }> {
    const applicableIssues = issues.filter((i) => i.suggestedText && i.status !== 'applied');
    let success = 0;
    let failed = 0;
    const total = applicableIssues.length;

    if (total === 0) return { success: 0, failed: 0 };

    await Word.run(async (context) => {
        for (let i = 0; i < applicableIssues.length; i++) {
            const issue = applicableIssues[i];
            if (!issue) continue;
            try {
                const ok = await applyIssue(context, issue);
                if (ok) success++;
                else failed++;
            } catch {
                failed++;
            }
            onProgress?.(i + 1, total);
        }
    });

    return { success, failed };
}
