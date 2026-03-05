import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
    Play, RotateCcw, CheckCircle, AlertCircle, Loader2, MessageSquarePlus,
    MessageSquare, Edit3, MousePointer, Clock, Zap, History, Tag, Download, BookOpen
} from 'lucide-react';
import clsx from 'clsx';
import { useReviewStore } from '../../../store/reviewStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { usePlatform } from '../../../platform/platformContext';
import { batchComment, batchApply, clearAllRangeCache } from '../../../platform/issueActions';
import { apiClient } from '../../../services/apiClient';
import IssueCard from './IssueCard';
import HistoryPanel from './HistoryPanel';
import SummaryCard from './SummaryCard';
import ClauseLibrary from './ClauseLibrary';
import { ensureSentenceBoundary } from '../../../utils/issuePostProcess';
import type { ReviewIssue } from '../../../types/review';

const ALL_CATEGORIES = ['risk_clause', 'missing_clause', 'compliance', 'clause_analysis'] as const;
const CATEGORY_LABELS: Record<typeof ALL_CATEGORIES[number], string> = {
    risk_clause: '风险条款',
    missing_clause: '缺失条款',
    compliance: '合规问题',
    clause_analysis: '条款分析',
};

function formatTime(isoString: string): string {
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function normalizeForSort(text: string): string {
    // 只保留 CJK 汉字、英文字母、数字，其余全部移除
    return text.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '').toLowerCase();
}

export default function ReviewPanel() {
    const {
        status, result, errorMessage, errorType, activeIssueId,
        streamingIssueCount,
        setStatus, setError, addStreamingIssue, setResult, reset, updateIssueStatus,
    } = useReviewStore();
    const { settings } = useSettingsStore();
    const platform = usePlatform();
    const [filter, setFilter] = useState<string>('all');
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showClauseLibrary, setShowClauseLibrary] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('auto');
    const [sortMode, setSortMode] = useState<'default' | 'position' | 'risk'>('default');

    // 排序索引缓存
    const sortIndexCache = useRef<Map<string, number>>(new Map());

    // 缓存文档全文，用于按位置排序
    const docContentRef = useRef<string>('');
    const [docTextUpdated, setDocTextUpdated] = useState<number>(0);

    // 用 ref 标记是否是"刚做完"的审查（false 时显示"来自上次"提示）
    const isNewReview = useRef(false);

    /** 通用审查入口 */
    const runReview = useCallback(async (docContent: string, isSelection = false) => {
        try {
            setStatus('analyzing');
            const startTime = Date.now();

            const reviewReq = {
                content: docContent,
                provider: settings.provider,
                model: settings.models[settings.provider],
                depth: settings.reviewDepth,
                apiKey: settings.provider === 'ollama'
                    ? undefined
                    : settings.apiKeys[settings.provider === 'claude' ? 'anthropic' : 'openai'],
                baseUrl: settings.provider === 'openai' ? settings.baseUrl : undefined,
                globalInstruction: settings.globalInstruction,
                standpoint: settings.standpoint,
                selectedTemplate: selectedTemplateId !== 'auto'
                    ? settings.reviewTemplates?.find(t => t.id === selectedTemplateId)
                    : undefined,
            };

            // 发起并行任务：提取摘要
            const summaryStore = useReviewStore.getState();
            summaryStore.setSummaryStatus('loading');
            apiClient.getSummary(reviewReq, settings.serverUrl)
                .then((summaryData: import('../../../types/summary').ContractSummary) => {
                    useReviewStore.getState().setSummary(summaryData);
                })
                .catch((err: unknown) => {
                    console.error('Failed to get summary:', err);
                    useReviewStore.getState().setSummaryError();
                });

            await apiClient.reviewStream(
                reviewReq,
                settings.serverUrl,
                {
                    onIssue: (issue: ReviewIssue) => addStreamingIssue(
                        ensureSentenceBoundary(issue, docContent)
                    ),
                    onSummary: (summary: string, model: string, contractType?: string, contractLabel?: string) => {
                        const finalResult = {
                            issues: useReviewStore.getState().result?.issues ?? [],
                            summary: isSelection ? `[局部审查] ${summary}` : summary,
                            durationMs: Date.now() - startTime,
                            model,
                            createdAt: new Date().toISOString(),
                            ...(contractType ? { contractType } : {}),
                            ...(contractLabel ? { contractLabel } : {}),
                        };
                        isNewReview.current = true;
                        setResult(finalResult);
                    },
                    onError: (err: string, errType) => setError(err, errType),
                }
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '审查过程中发生未知错误');
        }
    }, [settings, setStatus, setError, addStreamingIssue, setResult, selectedTemplateId]);

    /** 全文审查 */
    const handleStartReview = useCallback(async () => {
        clearAllRangeCache();
        sortIndexCache.current.clear();
        reset();
        isNewReview.current = false;
        setSelectionMode(false);
        setStatus('reading');
        try {
            const docContent = await platform.documentReader.readFullText();
            if (!docContent || docContent.trim().length < 10) {
                setError('文档内容为空，请先打开一份合同文档');
                return;
            }
            docContentRef.current = docContent;
            setDocTextUpdated(Date.now());
            await runReview(docContent, false);
        } catch (err) {
            setError(err instanceof Error ? err.message : '读取文档失败');
        }
    }, [reset, setStatus, setError, runReview, platform]);

    /** 局部审查（选中段落） */
    const handleSelectionReview = useCallback(async () => {
        clearAllRangeCache();
        sortIndexCache.current.clear();
        reset();
        isNewReview.current = false;
        setSelectionMode(true);
        setStatus('reading');
        try {
            const selText = await platform.documentReader.readSelection();
            if (!selText) {
                setError('请先在文档中选中需要审查的文本段落');
                return;
            }
            docContentRef.current = selText;
            setDocTextUpdated(Date.now());
            await runReview(selText, true);
        } catch (err) {
            setError(err instanceof Error ? err.message : '读取选中内容失败');
        }
    }, [reset, setStatus, setError, runReview, platform]);

    const effectiveSortMode = status === 'analyzing' ? 'default' : sortMode;

    const filteredIssues = useMemo(() => {
        const baseFilteredIssues = result?.issues.filter((issue) => {
            if (issue.status === 'dismissed') return false;
            if (filter === 'all') return true;
            return issue.category === filter;
        }) ?? [];

        if (effectiveSortMode === 'default') return baseFilteredIssues;

        const list = [...baseFilteredIssues];
        if (effectiveSortMode === 'position') {
            const docNormalized = normalizeForSort(docContentRef.current);
            list.sort((a, b) => {
                const getIndex = (issue: ReviewIssue): number => {
                    const cached = sortIndexCache.current.get(issue.id);
                    if (cached !== undefined) return cached;

                    const normalized = normalizeForSort(issue.originalText);
                    let idx = docNormalized.indexOf(normalized);

                    // 递减前缀长度尝试匹配
                    if (idx === -1 && normalized.length > 8) {
                        for (let len = Math.min(normalized.length, 60); len >= 8; len -= 5) {
                            idx = docNormalized.indexOf(normalized.slice(0, len));
                            if (idx !== -1) break;
                        }
                    }

                    if (idx === -1) idx = Infinity;
                    sortIndexCache.current.set(issue.id, idx);
                    return idx;
                };
                return getIndex(a) - getIndex(b);
            });
        } else if (effectiveSortMode === 'risk') {
            const riskScore: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
            list.sort((a, b) => {
                const scoreA = riskScore[a.riskLevel] ?? 99;
                const scoreB = riskScore[b.riskLevel] ?? 99;
                return scoreA - scoreB;
            });
        }
        return list;
    }, [result?.issues, filter, effectiveSortMode, docTextUpdated]);

    const issueCountByLevel = result?.issues.reduce(
        (acc, issue) => {
            if (issue.status !== 'dismissed') {
                acc[issue.riskLevel] = (acc[issue.riskLevel] ?? 0) + 1;
            }
            return acc;
        },
        {} as Record<string, number>
    );

    /** 批量添加批注（针对当前过滤结果） */
    const handleBatchComment = useCallback(async () => {
        const targets = filteredIssues.filter((i) => i.status !== 'commented');
        if (targets.length === 0) return;
        setBatchProgress({ done: 0, total: targets.length });
        try {
            const { success } = await batchComment(platform, targets, (done, total, lastSuccess) => {
                setBatchProgress({ done, total });
                if (lastSuccess) {
                    const target = targets[done - 1];
                    if (target) updateIssueStatus(target.id, 'commented');
                }
            });
            setTimeout(() => {
                alert(`批量批注完成：成功 ${success}/${targets.length}`);
            }, 100);
        } finally {
            setBatchProgress(null);
        }
    }, [filteredIssues, updateIssueStatus, platform]);

    /** 批量应用修改（针对当前过滤结果） */
    const handleBatchApply = useCallback(async () => {
        const targets = filteredIssues.filter((i) => i.suggestedText && i.status !== 'applied');
        if (targets.length === 0) return;
        setBatchProgress({ done: 0, total: targets.length });
        try {
            const { success } = await batchApply(platform, targets, (done, total, lastSuccess) => {
                setBatchProgress({ done, total });
                if (lastSuccess) {
                    const target = targets[done - 1];
                    if (target) updateIssueStatus(target.id, 'applied');
                }
            });
            setTimeout(() => {
                alert(`批量应用完成：成功 ${success}/${targets.length}`);
            }, 100);
        } finally {
            setBatchProgress(null);
        }
    }, [filteredIssues, updateIssueStatus, platform]);

    /** 导出审查报告为 Word 文档 */
    const handleExportReport = useCallback(async () => {
        if (!result) return;
        try {
            setStatus('analyzing'); // 借用 analyzing 状态显示 loading，或者也可以不显示
            await platform.reportGenerator.generateReport(
                result,
                useReviewStore.getState().summary,
                result.contractLabel // 使用保存的新字段
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成报告失败');
        } finally {
            setStatus('completed');
        }
    }, [result, setError, setStatus, platform]);

    const hasApplicable = filteredIssues.some((i) => i.suggestedText && i.status !== 'applied');
    const isAnalyzing = status === 'reading' || status === 'analyzing';

    // 历史面板
    if (showHistory) {
        return <HistoryPanel onClose={() => setShowHistory(false)} />;
    }

    // 条款库面板
    if (showClauseLibrary) {
        return <ClauseLibrary onClose={() => setShowClauseLibrary(false)} />;
    }

    return (
        <div className="flex flex-col h-full">
            {/* 顶部操作栏 */}
            <div className="flex-shrink-0 p-3 border-b border-gray-200 bg-white space-y-2">
                {/* 模板选择器 */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">审查模板:</span>
                    <select
                        value={selectedTemplateId}
                        onChange={e => setSelectedTemplateId(e.target.value)}
                        disabled={isAnalyzing}
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-gray-50/50"
                    >
                        <option value="auto">✨ 智能自动识别 (推荐)</option>
                        {settings.reviewTemplates && settings.reviewTemplates.length > 0 && (
                            <optgroup label="可用模板">
                                {settings.reviewTemplates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} {t.isBuiltin ? '(内置)' : ''}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>

                <div className="flex gap-2">
                    {/* 全文审查按钮 */}
                    <button
                        id="btn-start-review"
                        onClick={handleStartReview}
                        disabled={isAnalyzing}
                        className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                    >
                        {status === 'reading' && !selectionMode ? (
                            <><Loader2 size={14} className="animate-spin" />读取文档...</>
                        ) : status === 'analyzing' && !selectionMode ? (
                            <><Loader2 size={14} className="animate-spin" />AI 分析中...</>
                        ) : (
                            <><Play size={14} />开始审查</>
                        )}
                    </button>

                    {/* 局部审查按钮 */}
                    <button
                        id="btn-selection-review"
                        onClick={handleSelectionReview}
                        disabled={isAnalyzing}
                        title="审查当前选中的文本段落"
                        className="btn-secondary flex items-center gap-1 px-2 text-xs"
                    >
                        {isAnalyzing && selectionMode ? (
                            <Loader2 size={13} className="animate-spin" />
                        ) : (
                            <MousePointer size={13} />
                        )}
                        选中
                    </button>

                    {/* 历史记录按钮 */}
                    <button
                        onClick={() => setShowHistory(true)}
                        className="btn-secondary p-2"
                        title="查看历史审查记录"
                    >
                        <History size={14} />
                    </button>

                    {/* 条款库按钮 */}
                    <button
                        onClick={() => setShowClauseLibrary(true)}
                        className="btn-secondary p-2"
                        title="标准条款库"
                    >
                        <BookOpen size={14} />
                    </button>

                    {/* 导出报告按钮 */}
                    {status === 'completed' && result && (
                        <button
                            onClick={handleExportReport}
                            className="btn-secondary p-2"
                            title="导出审查报告"
                        >
                            <Download size={14} />
                        </button>
                    )}

                    {status !== 'idle' && (
                        <button
                            onClick={() => { reset(); setSelectionMode(false); isNewReview.current = false; }}
                            className="btn-secondary p-2"
                            title="重置"
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}
                </div>

                {/* 流式进度提示 */}
                {status === 'analyzing' && (
                    <div className="flex items-center gap-1.5 text-xs text-primary-600">
                        <Zap size={11} className="animate-pulse" />
                        <span>已发现 <strong>{streamingIssueCount}</strong> 个问题，分析中…</span>
                    </div>
                )}

                {/* 统计摘要 + 合同类型标签 */}
                {result && (
                    <div className="flex gap-3 text-xs text-gray-500 flex-wrap items-center">
                        {issueCountByLevel?.['high'] != null && (
                            <span className="text-red-600 font-medium">⚠ {issueCountByLevel['high']} 高风险</span>
                        )}
                        {issueCountByLevel?.['medium'] != null && (
                            <span className="text-amber-600">△ {issueCountByLevel['medium']} 中风险</span>
                        )}
                        {issueCountByLevel?.['low'] != null && (
                            <span className="text-emerald-600">○ {issueCountByLevel['low']} 低风险</span>
                        )}
                        {/* 合同类型标签（G） */}
                        {result.contractLabel && (
                            <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full text-xs border border-indigo-100">
                                <Tag size={10} />
                                {result.contractLabel}
                            </span>
                        )}
                        <span className="ml-auto text-gray-400">{result.model}</span>
                    </div>
                )}

                {/* 上次审查时间提示（B：持久化） */}
                {result && !isNewReview.current && status === 'completed' && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock size={11} />
                        <span>结果来自上次审查 · {formatTime(result.createdAt)}</span>
                    </div>
                )}
            </div>

            {/* 错误提示（E：分类错误） */}
            {status === 'error' && (
                <div className="mx-3 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-red-700 break-words">{errorMessage}</p>
                        {errorType === 'auth' && (
                            <p className="text-xs text-red-500 mt-0.5">● API Key 无效，请在「设置」中更新密钥</p>
                        )}
                        {errorType === 'quota' && (
                            <p className="text-xs text-red-500 mt-0.5">● 额度不足或达到速率限制，请稍后再试</p>
                        )}
                        {errorType === 'network' && (
                            <p className="text-xs text-red-500 mt-0.5">● 网络连接失败（已自动重试 2 次），请检查服务地址</p>
                        )}
                    </div>
                </div>
            )}

            {/* 完成提示 */}
            {status === 'completed' && result && (
                <div className="mx-3 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
                    <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700 leading-relaxed">{result.summary}</p>
                </div>
            )}

            {/* 合同结构化摘要卡片 */}
            {(useReviewStore.getState().summaryStatus !== 'idle') && (
                <div className="px-3">
                    <SummaryCard />
                </div>
            )}

            {/* 分类过滤 Tab + 批量操作 */}
            {result && result.issues.length > 0 && (
                <div className="flex-shrink-0 px-3 pt-2 space-y-1.5">
                    {/* 分类 Tab 单独一行 */}
                    <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-hide">
                        {(['all', ...ALL_CATEGORIES] as const).map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setFilter(cat)}
                                className={clsx(
                                    'flex-shrink-0 text-xs px-2.5 py-1.5 rounded-full border transition-colors',
                                    filter === cat
                                        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                )}
                            >
                                {cat === 'all'
                                    ? `全部 (${result.issues.filter((i) => i.status !== 'dismissed').length})`
                                    : CATEGORY_LABELS[cat]}
                            </button>
                        ))}
                    </div>

                    {/* 工具栏：批量操作与排序 */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                        {/* 批量操作部分 */}
                        <div className="flex items-center gap-1.5">
                            {filteredIssues.length > 0 && (
                                batchProgress ? (
                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <Loader2 size={11} className="animate-spin" />
                                        {batchProgress.done}/{batchProgress.total} 完成…
                                    </span>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleBatchComment}
                                            disabled={!!batchProgress}
                                            className="flex items-center gap-1 text-[11px] py-1 px-1.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors disabled:opacity-50"
                                            title={`对当前筛选的 ${filteredIssues.length} 个问题全部添加批注`}
                                        >
                                            <MessageSquare size={10} />
                                            全部批注
                                        </button>
                                        {hasApplicable && (
                                            <button
                                                onClick={handleBatchApply}
                                                disabled={!!batchProgress}
                                                className="flex items-center gap-1 text-[11px] py-1 px-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors disabled:opacity-50"
                                                title="对当前筛选的问题全部应用修改建议"
                                            >
                                                <Edit3 size={10} />
                                                全部应用
                                            </button>
                                        )}
                                    </>
                                )
                            )}
                        </div>

                        {/* 排序按钮 */}
                        <div className="flex ml-auto flex-shrink-0 items-center gap-1.5">
                            <span className="text-[10px] text-gray-400">排序:</span>
                            <div className="flex items-center bg-gray-100/80 rounded p-0.5 gap-0.5 border border-gray-200/50">
                                <button
                                    onClick={() => setSortMode('default')}
                                    disabled={status === 'analyzing'}
                                    className={clsx(
                                        'text-[10px] px-1.5 py-0.5 rounded transition-all',
                                        effectiveSortMode === 'default' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700',
                                        status === 'analyzing' && 'opacity-50 cursor-not-allowed'
                                    )}
                                    title="按AI发现问题的先后顺序"
                                >发现顺序</button>
                                <button
                                    onClick={() => setSortMode('position')}
                                    disabled={status === 'analyzing'}
                                    className={clsx(
                                        'text-[10px] px-1.5 py-0.5 rounded transition-all',
                                        effectiveSortMode === 'position' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700',
                                        status === 'analyzing' && 'opacity-50 cursor-not-allowed'
                                    )}
                                    title="按问题在文档中从上到下的位置进行排序"
                                >文档位置</button>
                                <button
                                    onClick={() => setSortMode('risk')}
                                    disabled={status === 'analyzing'}
                                    className={clsx(
                                        'text-[10px] px-1.5 py-0.5 rounded transition-all',
                                        effectiveSortMode === 'risk' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700',
                                        status === 'analyzing' && 'opacity-50 cursor-not-allowed'
                                    )}
                                    title="按风险严重程度优先排序"
                                >严重程度</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 问题列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {status === 'idle' && (
                    <div className="text-center py-12 text-gray-400">
                        <MessageSquarePlus size={32} className="mx-auto mb-3 opacity-40" />
                        <p className="text-sm">点击「开始审查」分析当前合同</p>
                        <p className="text-xs mt-1 opacity-70">或用「选中」按钮审查选定段落</p>
                    </div>
                )}

                {filteredIssues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} isActive={activeIssueId === issue.id} />
                ))}

                {status === 'completed' && filteredIssues.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                        <CheckCircle size={28} className="mx-auto mb-2 text-emerald-400" />
                        <p className="text-sm">该分类下无问题</p>
                    </div>
                )}
            </div>
        </div>
    );
}
