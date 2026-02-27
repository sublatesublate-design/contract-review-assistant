import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReviewIssue, ReviewResult, ReviewStatus } from '../types/review';
import type { ContractSummary, SummaryStatus } from '../types/summary';

/** 错误分类 */
export type ReviewErrorType = 'auth' | 'quota' | 'network' | 'unknown';

/** 历史记录摘要（轻量，只存元数据） */
export interface ReviewHistorySummary {
    id: string;
    createdAt: string;
    model: string;
    durationMs: number;
    issueCount: number;
    /** 风险分布 */
    riskBreakdown: Record<string, number>;
    summary: string;
    /** 是否保留完整 issues（最近 3 条） */
    hasFullData: boolean;
    issues?: ReviewIssue[];
}

interface ReviewState {
    status: ReviewStatus;
    result: ReviewResult | null;
    errorMessage: string | null;
    errorType: ReviewErrorType | null;
    /** 当前选中/定位的问题 ID */
    activeIssueId: string | null;
    /** 流式接收中的问题计数（实时进度用） */
    streamingIssueCount: number;
    /** 历史审查记录 */
    history: ReviewHistorySummary[];

    /** 合同摘要状态 */
    summary: ContractSummary | null;
    summaryStatus: SummaryStatus;

    // Actions
    setStatus: (status: ReviewStatus) => void;
    setResult: (result: ReviewResult) => void;
    setError: (message: string, errorType?: ReviewErrorType) => void;
    setActiveIssue: (id: string | null) => void;
    updateIssueStatus: (id: string, status: ReviewIssue['status']) => void;
    addStreamingIssue: (issue: ReviewIssue) => void;

    setSummary: (summary: ContractSummary) => void;
    setSummaryStatus: (status: SummaryStatus) => void;
    setSummaryError: () => void;

    reset: () => void;
    clearHistory: () => void;
}

export const useReviewStore = create<ReviewState>()(
    persist(
        (set, get) => ({
            status: 'idle',
            result: null,
            errorMessage: null,
            errorType: null,
            activeIssueId: null,
            streamingIssueCount: 0,
            history: [],
            summary: null,
            summaryStatus: 'idle',

            setStatus: (status) => set({ status, errorMessage: null, errorType: null }),

            setResult: (result) => {
                // 将本次结果存入历史
                const state = get();
                const existingHistory = state.history;
                const issues = result.issues;
                const riskBreakdown = issues.reduce(
                    (acc, i) => {
                        if (i.status !== 'dismissed') acc[i.riskLevel] = (acc[i.riskLevel] ?? 0) + 1;
                        return acc;
                    },
                    {} as Record<string, number>
                );

                // 最多保留 10 条摘要，最近 3 条含完整 issues
                const newEntry: ReviewHistorySummary = {
                    id: `review-${Date.now()}`,
                    createdAt: result.createdAt,
                    model: result.model,
                    durationMs: result.durationMs,
                    issueCount: issues.length,
                    riskBreakdown,
                    summary: result.summary,
                    hasFullData: true,
                    issues,
                };

                // 旧的完整记录超过 3 条时，裁剪 issues 字段
                const updatedHistory = [newEntry, ...existingHistory]
                    .slice(0, 10)
                    .map((entry, idx): ReviewHistorySummary => {
                        const { issues: _issues, ...rest } = entry;
                        if (idx < 3 && _issues) {
                            return { ...rest, hasFullData: true, issues: _issues };
                        }
                        return { ...rest, hasFullData: false };
                    });

                set({ result, status: 'completed', streamingIssueCount: 0, history: updatedHistory });
            },

            setError: (errorMessage, errorType = 'unknown') =>
                set({ errorMessage, errorType, status: 'error', streamingIssueCount: 0 }),

            setActiveIssue: (activeIssueId) => set({ activeIssueId }),

            updateIssueStatus: (id, status) =>
                set((state) => {
                    if (!state.result) return state;
                    return {
                        result: {
                            ...state.result,
                            issues: state.result.issues.map((issue) =>
                                issue.id === id ? { ...issue, status } : issue
                            ),
                        },
                    };
                }),

            /** 流式接收：逐步追加 Issue，同时更新计数器 */
            addStreamingIssue: (issue) =>
                set((state) => ({
                    streamingIssueCount: state.streamingIssueCount + 1,
                    result: state.result
                        ? { ...state.result, issues: [...state.result.issues, issue] }
                        : {
                            issues: [issue],
                            summary: '',
                            durationMs: 0,
                            model: '',
                            createdAt: new Date().toISOString(),
                        },
                })),

            setSummary: (summary) => set({ summary, summaryStatus: 'done' }),
            setSummaryStatus: (summaryStatus) => set({ summaryStatus }),
            setSummaryError: () => set({ summaryStatus: 'error', summary: null }),

            reset: () =>
                set({
                    status: 'idle', result: null, errorMessage: null, errorType: null, activeIssueId: null, streamingIssueCount: 0,
                    summary: null, summaryStatus: 'idle'
                }),

            clearHistory: () => set({ history: [] }),
        }),
        {
            name: 'contract-review-result',
            partialize: (state) => ({
                // 持久化：结果 + 历史，排除临时状态
                result: state.result,
                // 若持久化时状态是"分析中"，恢复为 error（插件刷新了）
                status: (state.status === 'analyzing' || state.status === 'reading')
                    ? 'error'
                    : state.status,
                errorMessage: (state.status === 'analyzing' || state.status === 'reading')
                    ? '插件已重新加载，上次审查未完成，请重新发起'
                    : state.errorMessage,
                errorType: state.errorType,
                history: state.history,
            }),
        }
    )
);
