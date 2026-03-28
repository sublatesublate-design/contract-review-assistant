import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw, CheckCircle, AlertCircle, Loader2, MessageSquarePlus, MessageSquare, Edit3, MousePointer, Clock, Zap, History, Tag, Download, BookOpen } from 'lucide-react';
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
import ElementPleadingPanel from './ElementPleadingPanel';
import { ensureSentenceBoundary, ensureNoOverlap } from '../../../utils/issuePostProcess';
import type { ReviewIssue } from '../../../types/review';
import type { LegalDocumentType } from '../../../types/legalDocument';
import { DOCUMENT_TYPE_CATEGORIES, ISSUE_CATEGORY_LABELS, LEGAL_DOCUMENT_TYPE_OPTIONS, LEGAL_DOCUMENT_TYPE_LABELS } from '../../../constants/legalWriting';

function formatTime(isoString: string): string {
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function normalizeForSort(text: string): string {
    return text.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '').toLowerCase();
}

type LitigationMode = 'review' | 'element_pleading';

export default function ReviewPanel() {
    const {
        status,
        result,
        errorMessage,
        errorType,
        activeIssueId,
        streamingIssueCount,
        summaryStatus,
        setStatus,
        setError,
        addStreamingIssue,
        setResult,
        reset,
        updateIssueStatus,
    } = useReviewStore();
    const { settings, updateSettings } = useSettingsStore();
    const platform = usePlatform();

    const [filter, setFilter] = useState('all');
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showClauseLibrary, setShowClauseLibrary] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState('auto');
    const [sortMode, setSortMode] = useState<'default' | 'position' | 'risk'>('default');
    const [reviewMode, setReviewMode] = useState<LitigationMode>('review');
    const docContentRef = useRef('');
    const [docTextUpdated, setDocTextUpdated] = useState(0);
    const isNewReview = useRef(false);

    const selectedDocumentType = settings.documentType;
    const activeDocumentType = (result?.documentType || selectedDocumentType || 'contract') as LegalDocumentType;
    const activeDocumentMeta = LEGAL_DOCUMENT_TYPE_OPTIONS.find((o) => o.id === activeDocumentType);
    const availableCategories = DOCUMENT_TYPE_CATEGORIES[activeDocumentType];
    const availableTemplates = (settings.reviewTemplates || []).filter((t) => t.documentType === selectedDocumentType);
    const canUseElementPleading = selectedDocumentType === 'litigation'
        && (platform.platform === 'word' || platform.platform === 'wps');

    useEffect(() => {
        if (!canUseElementPleading && reviewMode === 'element_pleading') setReviewMode('review');
    }, [canUseElementPleading, reviewMode]);

    useEffect(() => {
        if (sortMode === 'position' && !docContentRef.current) {
            platform.documentReader.readFullText().then((text) => {
                if (text) {
                    docContentRef.current = text;
                    setDocTextUpdated(Date.now());
                }
            }).catch((e) => console.warn('Lazy fetch document for sort failed', e));
        }
    }, [sortMode, platform]);

    const runReview = useCallback(async (docContent: string, isSelection = false) => {
        try {
            setStatus('analyzing');
            const startTime = Date.now();
            const reviewReq = {
                content: docContent,
                documentType: selectedDocumentType,
                provider: settings.provider,
                model: settings.models[settings.provider],
                depth: settings.reviewDepth,
                apiKey: settings.provider === 'ollama' ? undefined : settings.apiKeys[settings.provider === 'claude' ? 'anthropic' : 'openai'],
                baseUrl: settings.provider === 'openai' ? settings.baseUrl : undefined,
                globalInstruction: settings.globalInstruction,
                standpoint: settings.standpoint,
                selectedTemplate: selectedTemplateId !== 'auto' ? settings.reviewTemplates?.find((t) => t.id === selectedTemplateId) : undefined,
            };
            useReviewStore.getState().setSummaryStatus('loading');
            apiClient.getSummary(reviewReq, settings.serverUrl)
                .then((summaryData: import('../../../types/summary').ContractSummary) => useReviewStore.getState().setSummary(summaryData))
                .catch((err: unknown) => {
                    console.error('Failed to get summary:', err);
                    useReviewStore.getState().setSummaryError();
                });
            await apiClient.reviewStream(reviewReq, settings.serverUrl, {
                onIssue: (issue: ReviewIssue) => addStreamingIssue(ensureNoOverlap(ensureSentenceBoundary(issue, docContent), docContent), selectedDocumentType),
                onSummary: (summary: string, model: string, documentType?: string, documentLabel?: string) => {
                    const resolvedDocumentType = (documentType as LegalDocumentType | undefined) || selectedDocumentType;
                    const resolvedDocumentLabel = documentLabel || LEGAL_DOCUMENT_TYPE_LABELS[resolvedDocumentType];
                    setResult({
                        issues: useReviewStore.getState().result?.issues ?? [],
                        summary: isSelection ? `[局部审查] ${summary}` : summary,
                        durationMs: Date.now() - startTime,
                        model,
                        createdAt: new Date().toISOString(),
                        documentType: resolvedDocumentType,
                        documentLabel: resolvedDocumentLabel,
                        ...(resolvedDocumentType === 'contract' && documentLabel ? { contractLabel: documentLabel } : {}),
                    });
                    isNewReview.current = true;
                },
                onError: (err: string, errType) => setError(err, errType),
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : '审校过程中发生了意外错误');
        }
    }, [settings, setStatus, setError, addStreamingIssue, setResult, selectedTemplateId, selectedDocumentType]);

    const handleStartReview = useCallback(async () => {
        clearAllRangeCache(platform);
        reset();
        isNewReview.current = false;
        setSelectionMode(false);
        setStatus('reading');
        try {
            const docContent = await platform.documentReader.readFullText();
            if (!docContent || docContent.trim().length < 10) {
                setError('文书为空，请先打开一份文书。');
                return;
            }
            docContentRef.current = docContent;
            setDocTextUpdated(Date.now());
            await runReview(docContent, false);
        } catch (err) {
            setError(err instanceof Error ? err.message : '读取文书失败');
        }
    }, [reset, setStatus, setError, runReview, platform]);

    const handleSelectionReview = useCallback(async () => {
        clearAllRangeCache(platform);
        reset();
        isNewReview.current = false;
        setSelectionMode(true);
        setStatus('reading');
        try {
            const selText = await platform.documentReader.readSelection();
            if (!selText) {
                setError('请先选中需要审校的文本。');
                return;
            }
            docContentRef.current = selText;
            setDocTextUpdated(Date.now());
            await runReview(selText, true);
        } catch (err) {
            setError(err instanceof Error ? err.message : '读取所选文本失败');
        }
    }, [reset, setStatus, setError, runReview, platform]);

    const effectiveSortMode = status === 'analyzing' ? 'default' : sortMode;
    const filteredIssues = useMemo(() => {
        const base = result?.issues.filter((issue) => issue.status !== 'dismissed' && (filter === 'all' || issue.category === filter)) ?? [];
        if (effectiveSortMode === 'default') return base;
        const list = [...base];
        if (effectiveSortMode === 'position') {
            const docNormalized = normalizeForSort(docContentRef.current);
            list.sort((a, b) => {
                const getIndex = (issue: ReviewIssue): number => {
                    if (!docNormalized) return Infinity;
                    const normalized = normalizeForSort(issue.originalText);
                    let idx = docNormalized.indexOf(normalized);
                    if (idx === -1 && normalized.length > 8) {
                        for (let len = Math.min(normalized.length, 60); len >= 8; len -= 5) {
                            idx = docNormalized.indexOf(normalized.slice(0, len));
                            if (idx !== -1) break;
                        }
                    }
                    return idx === -1 ? Infinity : idx;
                };
                return getIndex(a) - getIndex(b);
            });
        } else {
            const riskScore: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
            list.sort((a, b) => (riskScore[a.riskLevel] ?? 99) - (riskScore[b.riskLevel] ?? 99));
        }
        return list;
    }, [result?.issues, filter, effectiveSortMode, docTextUpdated]);

    const issueCountByLevel = result?.issues.reduce((acc, issue) => {
        if (issue.status !== 'dismissed') acc[issue.riskLevel] = (acc[issue.riskLevel] ?? 0) + 1;
        return acc;
    }, {} as Record<string, number>);

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
            setTimeout(() => alert(`批量批注完成: ${success}/${targets.length} 成功`), 100);
        } finally {
            setBatchProgress(null);
        }
    }, [filteredIssues, updateIssueStatus, platform]);

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
            setTimeout(() => alert(`批量应用完成: ${success}/${targets.length} 成功`), 100);
        } finally {
            setBatchProgress(null);
        }
    }, [filteredIssues, updateIssueStatus, platform]);

    const handleExportReport = useCallback(async () => {
        if (!result) return;
        try {
            setStatus('analyzing');
            await platform.reportGenerator.generateReport(result, useReviewStore.getState().summary, result.documentLabel || result.contractLabel);
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成报告失败');
        } finally {
            setStatus('completed');
        }
    }, [result, setError, setStatus, platform]);

    const hasApplicable = filteredIssues.some((i) => i.suggestedText && i.status !== 'applied');
    const isAnalyzing = status === 'reading' || status === 'analyzing';

    if (showHistory) return <HistoryPanel onClose={() => setShowHistory(false)} />;
    if (showClauseLibrary) return <ClauseLibrary onClose={() => setShowClauseLibrary(false)} />;

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex-shrink-0 p-3 border-b border-gray-200 bg-white space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">文书类型：</span>
                    <select
                        value={selectedDocumentType}
                        onChange={(e) => {
                            updateSettings({ documentType: e.target.value as LegalDocumentType });
                            setSelectedTemplateId('auto');
                            setFilter('all');
                            setSelectionMode(false);
                            setReviewMode('review');
                        }}
                        disabled={isAnalyzing}
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-gray-50/50"
                    >
                        {LEGAL_DOCUMENT_TYPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                </div>

                {canUseElementPleading && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 whitespace-nowrap">模式：</span>
                        <div className="flex flex-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                            <button type="button" onClick={() => setReviewMode('review')} className={clsx('flex-1 rounded-md px-2 py-1 text-xs transition-colors', reviewMode === 'review' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700')}>审校模式</button>
                            <button type="button" onClick={() => setReviewMode('element_pleading')} className={clsx('flex-1 rounded-md px-2 py-1 text-xs transition-colors', reviewMode === 'element_pleading' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700')}>要素式撰写</button>
                        </div>
                    </div>
                )}

                {reviewMode === 'review' && (
                    <>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 whitespace-nowrap">审校模板：</span>
                            <select
                                value={selectedTemplateId}
                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                disabled={isAnalyzing}
                                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-gray-50/50"
                            >
                                <option value="auto">使用内置策略</option>
                                {availableTemplates.length > 0 && (
                                    <optgroup label="可用模板">
                                        {availableTemplates.map((t) => (
                                            <option key={t.id} value={t.id}>{t.name} {t.isBuiltin ? '(内置)' : ''}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        <div className="flex gap-2">
                            <button
                                id="btn-start-review"
                                onClick={handleStartReview}
                                disabled={isAnalyzing}
                                className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                            >
                                {status === 'reading' && !selectionMode ? <><Loader2 size={14} className="animate-spin" />正在读取...</> : status === 'analyzing' && !selectionMode ? <><Loader2 size={14} className="animate-spin" />正在审校...</> : <><Play size={14} />开始审校</>}
                            </button>

                            <button
                                id="btn-selection-review"
                                onClick={handleSelectionReview}
                                disabled={isAnalyzing}
                                title="审校所选文本"
                                className="btn-secondary flex items-center gap-1 px-2 text-xs"
                            >
                                {isAnalyzing && selectionMode ? <Loader2 size={13} className="animate-spin" /> : <MousePointer size={13} />}
                                所选审校
                            </button>

                            <button onClick={() => setShowHistory(true)} className="btn-secondary p-2" title="查看历史"><History size={14} /></button>
                            <button onClick={() => setShowClauseLibrary(true)} className="btn-secondary p-2" title="条款库" hidden={activeDocumentType !== 'contract'}><BookOpen size={14} /></button>
                            {status === 'completed' && result && <button onClick={handleExportReport} className="btn-secondary p-2" title="导出报告"><Download size={14} /></button>}
                            {status !== 'idle' && <button onClick={() => { reset(); setSelectionMode(false); isNewReview.current = false; }} className="btn-secondary p-2" title="重置"><RotateCcw size={14} /></button>}
                        </div>

                        {status === 'analyzing' && <div className="flex items-center gap-1.5 text-xs text-primary-600"><Zap size={11} className="animate-pulse" /><span>已发现 <strong>{streamingIssueCount}</strong> 个问题，正在审校…</span></div>}

                        {result && <div className="flex gap-3 text-xs text-gray-500 flex-wrap items-center">
                            {issueCountByLevel?.['high'] != null && <span className="text-red-600 font-medium">◆ {issueCountByLevel['high']} 高风险</span>}
                            {issueCountByLevel?.['medium'] != null && <span className="text-amber-600">● {issueCountByLevel['medium']} 中风险</span>}
                            {issueCountByLevel?.['low'] != null && <span className="text-emerald-600">○ {issueCountByLevel['low']} 低风险</span>}
                            {(result.documentLabel || result.contractLabel) && <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full text-xs border border-indigo-100"><Tag size={10} />{result.documentLabel || result.contractLabel}</span>}
                            <span className="ml-auto text-gray-400">{result.model}</span>
                        </div>}

                        {result && !isNewReview.current && status === 'completed' && <div className="flex items-center gap-1 text-xs text-gray-400"><Clock size={11} /><span>上次审校 · {formatTime(result.createdAt)}</span></div>}
                    </>
                )}
            </div>

            {reviewMode === 'element_pleading' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    <ElementPleadingPanel />
                </div>
            )}

            {reviewMode === 'review' && (
                <>
                    {status === 'error' && (
                        <div className="mx-3 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-red-700 break-words">{errorMessage}</p>
                                {errorType === 'auth' && <p className="text-xs text-red-500 mt-0.5">API 密钥无效，请在设置中更新。</p>}
                                {errorType === 'quota' && <p className="text-xs text-red-500 mt-0.5">已达到配额或速率限制，请稍后再试。</p>}
                                {errorType === 'network' && <p className="text-xs text-red-500 mt-0.5">网络请求失败，请检查服务器地址。</p>}
                            </div>
                        </div>
                    )}

                    {status === 'completed' && result && (
                        <div className="mx-3 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
                            <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-emerald-700 leading-relaxed">{result.summary}</p>
                        </div>
                    )}

                    {summaryStatus !== 'idle' && (
                        <div className="px-3">
                            <SummaryCard />
                        </div>
                    )}

                    {result && result.issues.length > 0 && (
                        <div className="flex-shrink-0 px-3 pt-2 space-y-1.5">
                            <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-hide">
                                {(['all', ...availableCategories] as const).map((cat) => (
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
                                            : ISSUE_CATEGORY_LABELS[cat]}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1">
                                <div className="flex items-center gap-1.5">
                                    {filteredIssues.length > 0 && (
                                        batchProgress ? (
                                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                                <Loader2 size={11} className="animate-spin" />
                                                {batchProgress.done}/{batchProgress.total} 已完成
                                            </span>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={handleBatchComment}
                                                    disabled={!!batchProgress}
                                                    className="flex items-center gap-1 text-[11px] py-1 px-1.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors disabled:opacity-50"
                                                    title={`为当前筛选出的 ${filteredIssues.length} 个问题批量批注`}
                                                >
                                                    <MessageSquare size={10} />
                                                    批量批注
                                                </button>
                                                {hasApplicable && (
                                                    <button
                                                        onClick={handleBatchApply}
                                                        disabled={!!batchProgress}
                                                        className="flex items-center gap-1 text-[11px] py-1 px-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors disabled:opacity-50"
                                                        title="应用所有建议修改"
                                                    >
                                                        <Edit3 size={10} />
                                                        批量应用
                                                    </button>
                                                )}
                                            </>
                                        )
                                    )}
                                </div>

                                <div className="flex ml-auto flex-shrink-0 items-center gap-1.5">
                                    <span className="text-[10px] text-gray-400">排序：</span>
                                    <div className="flex items-center bg-gray-100/80 rounded p-0.5 gap-0.5 border border-gray-200/50">
                                        <button
                                            onClick={() => setSortMode('default')}
                                            disabled={status === 'analyzing'}
                                            className={clsx(
                                                'text-[10px] px-1.5 py-0.5 rounded transition-all',
                                                effectiveSortMode === 'default' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700',
                                                status === 'analyzing' && 'opacity-50 cursor-not-allowed'
                                            )}
                                            title="按 AI 发现顺序排序"
                                        >
                                            发现顺序
                                        </button>
                                        <button
                                            onClick={() => setSortMode('position')}
                                            disabled={status === 'analyzing'}
                                            className={clsx(
                                                'text-[10px] px-1.5 py-0.5 rounded transition-all',
                                                effectiveSortMode === 'position' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700',
                                                status === 'analyzing' && 'opacity-50 cursor-not-allowed'
                                            )}
                                            title="按文档位置排序"
                                        >
                                            位置
                                        </button>
                                        <button
                                            onClick={() => setSortMode('risk')}
                                            disabled={status === 'analyzing'}
                                            className={clsx(
                                                'text-[10px] px-1.5 py-0.5 rounded transition-all',
                                                effectiveSortMode === 'risk' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700',
                                                status === 'analyzing' && 'opacity-50 cursor-not-allowed'
                                            )}
                                            title="按严重程度排序"
                                        >
                                            严重程度
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {status === 'idle' && (
                            <div className="text-center py-12 text-gray-400">
                                <MessageSquarePlus size={32} className="mx-auto mb-3 opacity-40" />
                                <p className="text-sm">{activeDocumentMeta?.emptyStateTitle || '开始审校当前文书'}</p>
                                <p className="text-xs mt-1 opacity-70">{activeDocumentMeta?.emptyStateHint || '也可以使用所选审校对局部内容进行审校'}</p>
                            </div>
                        )}

                        {filteredIssues.map((issue) => (
                            <IssueCard
                                key={issue.id}
                                issue={issue}
                                isActive={activeIssueId === issue.id}
                                {...(activeDocumentType === 'contract' ? { onOpenClauseLibrary: () => setShowClauseLibrary(true) } : {})}
                            />
                        ))}

                        {status === 'completed' && filteredIssues.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                <CheckCircle size={28} className="mx-auto mb-2 text-emerald-400" />
                                <p className="text-sm">当前筛选下没有问题</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
