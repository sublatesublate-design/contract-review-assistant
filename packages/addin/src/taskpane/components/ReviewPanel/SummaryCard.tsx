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
                    <h3 className="text-sm font-semibold text-gray-800">{summary?.title || '文稿关键摘要'}</h3>
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
                        <div className="space-y-4 text-sm">
                            {summary.overview && (
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">摘要概览</span>
                                    <p className="text-gray-800 leading-relaxed">{summary.overview}</p>
                                </div>
                            )}

                            {summary.fields?.length > 0 && (
                                <div className="grid grid-cols-2 gap-4">
                                    {summary.fields.map((field, index) => (
                                        <div key={`${field.label}-${index}`} className="col-span-2 sm:col-span-1">
                                            <span className="text-xs text-gray-500 block mb-1">{field.label}</span>
                                            <span className="font-medium text-gray-900">{field.value || '未见明确约定'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {summary.sections?.map((section, index) => (
                                <div key={`${section.title}-${index}`}>
                                    <span className="text-xs text-gray-500 block mb-1">{section.title}</span>
                                    {section.items.length > 0 ? (
                                        <ul className="list-disc list-inside text-gray-800 space-y-0.5">
                                            {section.items.map((item, itemIndex) => (
                                                <li key={`${section.title}-${itemIndex}`}>{item}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <span className="text-gray-500">未见明确约定</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
