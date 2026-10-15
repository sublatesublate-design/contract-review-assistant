import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Info, RotateCcw, Zap } from 'lucide-react';
import type { ThinkingCapabilities, ThinkingConfig, ThinkingEffort } from '../../../types/settings';
import { getLocalThinkingCapabilities } from '../../../constants/thinkingCapabilities';
import {
    DEFAULT_THINKING, THINKING_EFFORT_LABELS, isThinkingConfigSupported,
    isThinkingEffort, withThinkingEffort, withThinkingBudget,
} from '../../../constants/thinking';

export type ThinkingCapabilityStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface ThinkingCapabilityReport {
    status: ThinkingCapabilityStatus;
    capabilities: ThinkingCapabilities | null;
    error: string | null;
}

export function useThinkingCapabilities(provider: string, model: string): ThinkingCapabilityReport {
    return useMemo(() => model.trim()
        ? { status: 'ready', capabilities: getLocalThinkingCapabilities(provider, model), error: null }
        : { status: 'idle', capabilities: null, error: null }, [provider, model]);
}

export function isThinkingSaveBlocked(config: ThinkingConfig, report: ThinkingCapabilityReport): boolean {
    if (report.status !== 'ready') return config.effort !== 'auto' || config.budgetTokens !== undefined;
    return !isThinkingConfigSupported(config, report.capabilities);
}

interface ThinkingSettingsProps {
    value: ThinkingConfig;
    onChange: (next: ThinkingConfig) => void;
    provider: string;
    model: string;
    onCapabilityReportChange: (report: ThinkingCapabilityReport) => void;
    resetNotice: string | null;
}

export default function ThinkingSettings({ value, onChange, provider, model, onCapabilityReportChange, resetNotice }: ThinkingSettingsProps) {
    const report = useThinkingCapabilities(provider, model);
    const capabilities = report.capabilities;
    const [budgetDraft, setBudgetDraft] = useState(value.budgetTokens === undefined ? '' : String(value.budgetTokens));
    useEffect(() => {
        if (value.budgetTokens === undefined) setBudgetDraft('');
        else if (Number.isFinite(value.budgetTokens)) setBudgetDraft(String(value.budgetTokens));
    }, [value.budgetTokens]);
    const reportCallbackRef = useRef(onCapabilityReportChange);
    reportCallbackRef.current = onCapabilityReportChange;
    useEffect(() => { reportCallbackRef.current(report); }, [report]);

    const locked = report.status !== 'ready';
    const effortOptions: ThinkingEffort[] = capabilities?.efforts ?? ['auto'];
    const effortUnsupported = value.effort !== 'auto' && !effortOptions.includes(value.effort);
    const onlyAutoEffort = effortOptions.length === 1 && effortOptions[0] === 'auto';
    const budgetRange = capabilities?.budgetTokens;
    const budgetUnsupported = value.budgetTokens !== undefined && (!budgetRange
        || !Number.isInteger(value.budgetTokens) || value.budgetTokens < budgetRange.min || value.budgetTokens > budgetRange.max);
    const incompatible = effortUnsupported || budgetUnsupported;

    return (
        <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Zap size={12} />思考等级
            </h2>
            <div className="space-y-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                <p className="text-[10px] leading-relaxed text-gray-500">已适配模型默认开启思考，可手动调整下方等级。本地规则随插件加载，不需要联网查询。</p>
                <div className="flex items-center gap-2">
                    <label htmlFor="thinking-effort" className="text-xs text-gray-600 font-medium whitespace-nowrap">思考等级</label>
                    <select
                        id="thinking-effort"
                        value={effortUnsupported ? '' : value.effort}
                        onChange={(event) => {
                            if (isThinkingEffort(event.target.value)) {
                                onChange(withThinkingEffort({ ...value, mode: 'auto' }, event.target.value));
                            }
                        }}
                        disabled={locked || onlyAutoEffort}
                        className="ml-auto w-40 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                    >
                        {effortUnsupported && <option value="">当前等级不受支持</option>}
                        {effortOptions.map((effort) => <option key={effort} value={effort}>{THINKING_EFFORT_LABELS[effort]}</option>)}
                    </select>
                </div>
                {budgetRange && (
                    <div className="space-y-1.5">
                        <label htmlFor="thinking-budget" className="text-xs text-gray-600 font-medium">手动思考预算（token）</label>
                        <input
                            id="thinking-budget" type="number" min={budgetRange.min} max={budgetRange.max} step={1}
                            value={budgetDraft} disabled={locked} placeholder="留空使用上方等级或推荐值"
                            onChange={(event) => {
                                const raw = event.currentTarget.value;
                                setBudgetDraft(raw);
                                onChange(withThinkingBudget({ ...value, mode: 'auto' }, raw === '' && !event.currentTarget.validity.badInput
                                    ? undefined : event.currentTarget.validity.badInput ? Number.NaN : Number(raw)));
                            }}
                            aria-invalid={budgetUnsupported}
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100"
                        />
                        <p className="text-[10px] leading-relaxed text-gray-500">可填写 {budgetRange.min}—{budgetRange.max} 的整数；与上方等级预设二选一。</p>
                        {budgetUnsupported && <p className="text-[10px] text-red-700">预算必须是范围内的整数，保存已被阻止。</p>}
                    </div>
                )}
                {!locked && onlyAutoEffort && <p className="text-[10px] text-gray-500">此型号暂不支持调节等级，保留默认思考。</p>}
                {capabilities?.note && <p className="flex items-start gap-1 text-[10px] leading-relaxed text-gray-400"><Info size={10} className="mt-0.5 flex-shrink-0" /><span>{capabilities.note}</span></p>}
                {locked && <p className="text-[10px] text-gray-400">请先填写模型名称。</p>}
                {incompatible && (
                    <p className="flex items-start gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700">
                        <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />当前等级或预算不适用于此型号，请调整或恢复推荐值。
                    </p>
                )}
                {resetNotice && <p className="text-[10px] leading-relaxed text-sky-700">{resetNotice}</p>}
                {(incompatible || value.effort !== 'auto' || value.budgetTokens !== undefined) && (
                    <button type="button" onClick={() => onChange({ ...DEFAULT_THINKING })} className="text-[10px] text-primary-600 bg-primary-50 px-2 py-1 rounded-md font-bold flex items-center gap-1">
                        <RotateCcw size={10} />恢复推荐等级
                    </button>
                )}
            </div>
        </section>
    );
}
