import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import clsx from 'clsx';
import { useReviewStore } from '../../../store/reviewStore';

export default function SummaryCard() {
    const { summary, summaryStatus } = useReviewStore();
    const [expanded, setExpanded] = useState(true);

    if (summaryStatus === 'idle' || summaryStatus === 'error') return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden mt-4">
            {/* Header */}
            <div
                className="px-4 py-3 bg-gray-50/50 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2">
                    <FileText size={16} className="text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-800">合同关键摘要</h3>
                </div>
                <div className="flex items-center gap-3">
                    {summaryStatus === 'loading' && (
                        <span className="text-xs text-primary-600 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 inline-block animate-bounce" />
                            正在提取...
                        </span>
                    )}
                    <button className="text-gray-400 hover:text-gray-600 p-1">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>
            </div>

            {/* Content */}
            {expanded && (
                <div className="p-4 border-t border-gray-100">
                    {summaryStatus === 'loading' && !summary ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                            <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                            <div className="h-4 bg-gray-100 rounded w-full"></div>
                            <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                        </div>
                    ) : summary ? (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="col-span-2 sm:col-span-1">
                                <span className="text-xs text-gray-500 block mb-1">合同金额</span>
                                <span className="font-medium text-gray-900">{summary.amount || '未见明确约定'}</span>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <span className="text-xs text-gray-500 block mb-1">合同期限</span>
                                <span className="font-medium text-gray-900">{summary.duration || '未见明确约定'}</span>
                            </div>
                            <div className="col-span-2">
                                <span className="text-xs text-gray-500 block mb-1">当事人</span>
                                <div className="space-y-1">
                                    {summary.parties?.map((p: { role: string; name: string }, i: number) => (
                                        <div key={i} className="flex gap-2 text-gray-800 bg-gray-50 px-2 py-1.5 rounded">
                                            <span className="font-semibold min-w-[40px] text-gray-600">{p.role}</span>
                                            <span className="truncate">{p.name || '未见明确约定'}</span>
                                        </div>
                                    ))}
                                    {(!summary.parties || summary.parties.length === 0) && (
                                        <div className="text-gray-500">未见明确约定</div>
                                    )}
                                </div>
                            </div>
                            {summary.keyDates?.length > 0 && (
                                <div className="col-span-2">
                                    <span className="text-xs text-gray-500 block mb-1">关键日期</span>
                                    <ul className="list-disc list-inside text-gray-800 space-y-0.5">
                                        {summary.keyDates.map((date: string, i: number) => (
                                            <li key={i}>{date}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {summary.coreObligations && summary.coreObligations.length > 0 && (
                                <div className="col-span-2">
                                    <span className="text-xs text-gray-500 block mb-1">核心义务</span>
                                    <ul className="list-disc list-inside text-gray-800 space-y-0.5">
                                        {summary.coreObligations.map((ob: string, i: number) => (
                                            <li key={i}>{ob}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div className="col-span-2">
                                <span className="text-xs text-gray-500 block mb-1">争议解决方式</span>
                                <span className="text-gray-800">{summary.disputeResolution || '未见明确约定'}</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
