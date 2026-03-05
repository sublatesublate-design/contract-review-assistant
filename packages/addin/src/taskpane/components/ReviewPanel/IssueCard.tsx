import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, MapPin, MessageSquare, Edit3, X, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import type { ReviewIssue, RiskLevel, IssueCategory } from '../../../types/review';
import { useReviewStore } from '../../../store/reviewStore';
import { locateIssue, commentIssue, applyIssue, uncommentIssue, unapplyIssue } from '../../../platform/issueActions';
import { usePlatform } from '../../../platform/platformContext';

interface IssueCardProps {
    issue: ReviewIssue;
    isActive: boolean;
    onOpenClauseLibrary?: () => void;
}

const RISK_CONFIG: Record<RiskLevel, { label: string; icon: React.ReactNode; className: string }> = {
    high: {
        label: '高风险',
        icon: <AlertTriangle size={12} />,
        className: 'risk-badge-high',
    },
    medium: {
        label: '中风险',
        icon: <AlertCircle size={12} />,
        className: 'risk-badge-medium',
    },
    low: {
        label: '低风险',
        icon: <Info size={12} />,
        className: 'risk-badge-low',
    },
    info: {
        label: '建议',
        icon: <CheckCircle2 size={12} />,
        className: 'risk-badge-info',
    },
};

const CATEGORY_LABELS: Record<IssueCategory, string> = {
    risk_clause: '风险条款',
    missing_clause: '缺失条款',
    compliance: '合规问题',
    clause_analysis: '条款分析',
};

export default function IssueCard({ issue, isActive, onOpenClauseLibrary }: IssueCardProps) {
    const { setActiveIssue, updateIssueStatus } = useReviewStore();
    const platform = usePlatform();
    const [expanded, setExpanded] = React.useState(isActive);
    const [actionLoading, setActionLoading] = React.useState<string | null>(null);
    const [actionError, setActionError] = React.useState<string | null>(null);

    const showError = (msg: string) => {
        setActionError(msg);
        setTimeout(() => setActionError(null), 5000);
    };

    const riskConfig = RISK_CONFIG[issue.riskLevel];

    /** 定位到文档中的原文 */
    const handleLocate = async () => {
        setActionLoading('locate');
        setActionError(null);
        try {
            const ok = await locateIssue(platform, issue);
            if (ok) {
                updateIssueStatus(issue.id, 'located');
                setActiveIssue(issue.id);
            } else {
                showError('无法在文档中定位原文');
            }
        } catch (err) {
            console.error('定位失败:', err);
            showError('无法在文档中定位原文');
        } finally {
            setActionLoading(null);
        }
    };

    /** 在文档中添加或取消批注 */
    const handleComment = async () => {
        setActionLoading('comment');
        setActionError(null);
        try {
            if (issue.status === 'commented') {
                const ok = await uncommentIssue(platform, issue);
                if (ok) {
                    updateIssueStatus(issue.id, 'pending');
                } else {
                    showError('无法在文档中定位原批注');
                }
            } else {
                const ok = await commentIssue(platform, issue);
                if (ok) {
                    updateIssueStatus(issue.id, 'commented');
                } else {
                    showError('无法在文档中定位原文进行批注');
                }
            }
        } catch (err) {
            console.error('批注操作失败:', err);
            showError('操作失败，无法定位原文');
        } finally {
            setActionLoading(null);
        }
    };

    /** 应用或取消 AI 建议的修改（生成修订标记） */
    const handleApply = async () => {
        if (!issue.suggestedText) return;
        setActionLoading('apply');
        setActionError(null);
        try {
            if (issue.status === 'applied') {
                const ok = await unapplyIssue(platform, issue);
                if (ok) {
                    updateIssueStatus(issue.id, 'pending');
                } else {
                    showError('无法在文档中定位原修改');
                }
            } else {
                const ok = await applyIssue(platform, issue);
                if (ok) {
                    updateIssueStatus(issue.id, 'applied');
                } else {
                    showError('无法在文档中定位原文进行修改');
                }
            }
        } catch (err) {
            console.error('应用修改操作失败:', err);
            showError('操作失败，无法定位原文');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDismiss = () => updateIssueStatus(issue.id, 'dismissed');

    return (
        <div
            className={clsx(
                'bg-white rounded-lg border transition-all duration-150 overflow-hidden',
                isActive ? 'border-primary-400 shadow-md' : 'border-gray-200 shadow-sm',
                issue.status === 'dismissed' && 'opacity-40'
            )}
        >
            {/* 卡片头部 */}
            <button
                className="w-full text-left px-3 py-2.5 flex items-start gap-2"
                onClick={() => setExpanded(!expanded)}
            >
                {/* 风险等级徽章 */}
                <span
                    className={clsx(
                        'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5',
                        riskConfig.className
                    )}
                >
                    {riskConfig.icon}
                    {riskConfig.label}
                </span>

                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 leading-snug">{issue.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{CATEGORY_LABELS[issue.category]}</p>
                </div>

                {/* 关闭按钮 */}
                <button
                    onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
                    className="btn-ghost flex-shrink-0 -mr-1 -mt-0.5"
                    title="忽略此问题"
                >
                    <X size={12} />
                </button>
            </button>

            {/* 展开内容 */}
            {expanded && (
                <div className="px-3 pb-3 space-y-2 animate-fade-in">
                    {/* 问题描述 */}
                    <p className="text-xs text-gray-600 leading-relaxed">{issue.description}</p>

                    {/* 原文引用 */}
                    {issue.originalText && (
                        <div className="bg-gray-50 border border-gray-200 rounded p-2">
                            <p className="text-xs text-gray-400 mb-1">
                                {issue.category === 'missing_clause' ? '建议插入位置（锚点）：' : '合同原文：'}
                            </p>
                            <p className="text-xs text-gray-700 italic line-clamp-3">
                                「{issue.originalText}」
                            </p>
                        </div>
                    )}

                    {/* AI 修改建议 */}
                    {issue.suggestedText && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-2">
                            <p className="text-xs text-blue-500 mb-1">建议修改为：</p>
                            <p className="text-xs text-blue-800 leading-relaxed">{issue.suggestedText}</p>
                        </div>
                    )}

                    {/* 法律依据 */}
                    {issue.legalBasis && (
                        <p className="text-xs text-gray-400 italic">{issue.legalBasis}</p>
                    )}

                    {/* 操作错误提示 */}
                    {actionError && (
                        <div className="bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1.5 animate-fade-in">
                            <AlertCircle size={12} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-red-600 leading-snug">{actionError}</p>
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex gap-1.5 pt-1">
                        <button
                            onClick={handleLocate}
                            disabled={actionLoading === 'locate'}
                            className="flex items-center gap-1 text-xs py-1 px-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-50"
                            title="在文档中定位原文"
                        >
                            <MapPin size={11} />
                            {actionLoading === 'locate' ? '定位中...' : '定位'}
                        </button>
                        <button
                            onClick={handleComment}
                            disabled={actionLoading === 'comment'}
                            className="flex items-center gap-1 text-xs py-1 px-2 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors disabled:opacity-50"
                            title={issue.status === 'commented' ? '在文档中取消批注' : '在文档中添加批注'}
                        >
                            <MessageSquare size={11} />
                            {actionLoading === 'comment' ? (issue.status === 'commented' ? '取消中...' : '添加中...') : (issue.status === 'commented' ? '取消批注' : '批注')}
                        </button>
                        {issue.suggestedText && (
                            <button
                                onClick={handleApply}
                                disabled={actionLoading === 'apply'}
                                className="flex items-center gap-1 text-xs py-1 px-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-50"
                                title={issue.status === 'applied' ? '取消修改' : (issue.category === 'missing_clause' ? '在锚点后插入条款' : '应用 AI 修改建议（生成修订标记）')}
                            >
                                <Edit3 size={11} />
                                {actionLoading === 'apply'
                                    ? (issue.category === 'missing_clause' ? '插入中...' : (issue.status === 'applied' ? '取消中...' : '应用中...'))
                                    : (issue.category === 'missing_clause' ? '插入条款' : (issue.status === 'applied' ? '取消修改' : '应用修改'))}
                            </button>
                        )}
                        {issue.category === 'missing_clause' && onOpenClauseLibrary && (
                            <button
                                onClick={onOpenClauseLibrary}
                                className="flex items-center gap-1 text-xs py-1 px-2 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                                title="从标准条款库中选择条款插入"
                            >
                                <BookOpen size={11} />
                                查找条款
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
