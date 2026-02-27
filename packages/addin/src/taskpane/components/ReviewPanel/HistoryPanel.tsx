import React from 'react';
import { History, Clock, Bot, AlertTriangle, X, ChevronRight } from 'lucide-react';
import type { ReviewHistorySummary } from '../../../store/reviewStore';
import { useReviewStore } from '../../../store/reviewStore';

interface HistoryPanelProps {
    onClose: () => void;
}

function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
}

function RiskBar({ breakdown }: { breakdown: Record<string, number> }) {
    const high = breakdown['high'] ?? 0;
    const medium = breakdown['medium'] ?? 0;
    const low = breakdown['low'] ?? 0;
    const total = high + medium + low;
    if (total === 0) return null;
    return (
        <div className="flex gap-2 text-xs">
            {high > 0 && <span className="text-red-600 font-medium">⚠ {high}</span>}
            {medium > 0 && <span className="text-amber-600">△ {medium}</span>}
            {low > 0 && <span className="text-emerald-600">○ {low}</span>}
        </div>
    );
}

export default function HistoryPanel({ onClose }: HistoryPanelProps) {
    const { history, clearHistory, setResult } = useReviewStore();
    const [selected, setSelected] = React.useState<ReviewHistorySummary | null>(null);

    const handleRestore = (entry: ReviewHistorySummary) => {
        if (!entry.hasFullData || !entry.issues) {
            alert('该历史记录仅保留摘要，无法完整恢复（仅保留最近 3 条完整记录）');
            return;
        }
        setResult({
            issues: entry.issues,
            summary: entry.summary,
            durationMs: entry.durationMs,
            model: entry.model,
            createdAt: entry.createdAt,
        });
        onClose();
    };

    if (history.length === 0) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                        <History size={13} />历史审查记录
                    </h3>
                    <button onClick={onClose} className="btn-ghost"><X size={14} /></button>
                </div>
                <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                        <History size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">暂无历史记录</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 flex-shrink-0">
                <h3 className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                    <History size={13} />历史审查记录
                </h3>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => { if (confirm('确定清空所有历史记录？')) clearHistory(); }}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                        清空
                    </button>
                    <button onClick={onClose} className="btn-ghost"><X size={14} /></button>
                </div>
            </div>

            {/* 历史列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {history.map((entry) => (
                    <div
                        key={entry.id}
                        className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden transition-all ${selected?.id === entry.id ? 'border-primary-300' : ''}`}
                    >
                        {/* 列表项头部 */}
                        <button
                            className="w-full text-left px-3 py-2.5 flex items-start gap-2"
                            onClick={() => setSelected(selected?.id === entry.id ? null : entry)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <RiskBar breakdown={entry.riskBreakdown} />
                                    <span className="ml-auto text-xs text-gray-400">{entry.issueCount} 个问题</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                    <Clock size={11} />
                                    <span>{formatRelativeTime(entry.createdAt)}</span>
                                    <span>·</span>
                                    <Bot size={11} />
                                    <span className="truncate max-w-[100px]">{entry.model}</span>
                                    {!entry.hasFullData && (
                                        <span className="text-orange-400 ml-auto">仅摘要</span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight
                                size={13}
                                className={`text-gray-400 mt-0.5 transition-transform ${selected?.id === entry.id ? 'rotate-90' : ''}`}
                            />
                        </button>

                        {/* 展开详情 */}
                        {selected?.id === entry.id && (
                            <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                                <p className="text-xs text-gray-600 leading-relaxed">{entry.summary}</p>
                                {entry.hasFullData ? (
                                    <button
                                        onClick={() => handleRestore(entry)}
                                        className="w-full text-xs py-1.5 rounded bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 transition-colors font-medium"
                                    >
                                        恢复此次审查结果
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-xs text-orange-500">
                                        <AlertTriangle size={11} />
                                        <span>仅保留摘要，无法完整恢复</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
