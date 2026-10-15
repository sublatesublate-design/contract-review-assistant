import type {
    ThinkingCapabilities,
    ThinkingConfig,
    ThinkingEffort,
    ThinkingMode,
} from '../types/settings';

/**
 * 思考设置的取值域与纯函数工具。
 * 后端契约：{ modes, efforts, note }，未知模型仅返回 modes/efforts 为 ['auto']。
 */
export const THINKING_MODES: ThinkingMode[] = ['auto', 'enabled', 'disabled'];
export const THINKING_EFFORTS: ThinkingEffort[] = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];

export const DEFAULT_THINKING: ThinkingConfig = { mode: 'auto', effort: 'auto' };

export const THINKING_MODE_LABELS: Record<ThinkingMode, string> = {
    auto: '默认策略（已知模型开启）',
    enabled: '开启思考',
    disabled: '关闭思考',
};

export const THINKING_EFFORT_LABELS: Record<ThinkingEffort, string> = {
    auto: '推荐值（自动）',
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '极高',
    max: '最高',
};

/** 仅保留后端定义的取值顺序，过滤未知/重复项，至少回退到 ['auto']。 */
function pickKnown<T extends string>(value: unknown, allowed: readonly T[]): T[] {
    if (!Array.isArray(value)) {
        return [allowed[0] as T];
    }
    const picked: T[] = [];
    for (const item of allowed) {
        if (value.includes(item)) {
            picked.push(item);
        }
    }
    return picked.length > 0 ? picked : [allowed[0] as T];
}

export function isThinkingMode(value: unknown): value is ThinkingMode {
    return typeof value === 'string' && (THINKING_MODES as string[]).includes(value);
}

export function isThinkingEffort(value: unknown): value is ThinkingEffort {
    return typeof value === 'string' && (THINKING_EFFORTS as string[]).includes(value);
}

/**
 * 兼容旧持久化配置：合并部分对象、丢弃非法值、补齐默认值。
 * 模式控件已移除；旧关闭状态恢复默认开启，保留有效等级与预算。
 */
export function normalizeThinkingConfig(value: unknown): ThinkingConfig {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const mode: ThinkingMode = 'auto';
    const effort = isThinkingEffort(record['effort']) ? record['effort'] : DEFAULT_THINKING.effort;
    if (record['mode'] === 'disabled') return { ...DEFAULT_THINKING };
    const budget = record['budgetTokens'];
    if (typeof budget === 'number' && Number.isInteger(budget) && budget >= 1 && budget <= 32768) {
        return { mode, effort: 'auto', budgetTokens: budget };
    }
    return { mode, effort };
}

/** 解析后端能力响应；缺省/异常时视为仅支持 auto。 */
export function normalizeThinkingCapabilities(value: unknown): ThinkingCapabilities {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const note = record['note'];
    const range = record['budgetTokens'] as Record<string, unknown> | undefined;
    const min = range?.['min'];
    const max = range?.['max'];
    const budgetTokens = typeof min === 'number' && typeof max === 'number'
        && Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min && max <= 32768
        ? { min, max } : undefined;
    return {
        modes: pickKnown(record['modes'], THINKING_MODES),
        efforts: pickKnown(record['efforts'], THINKING_EFFORTS),
        note: typeof note === 'string' ? note.trim() : '',
        ...(budgetTokens ? { budgetTokens } : {}),
    };
}

/** auto 等级表示未显式指定预算，任何模型都兼容。 */
function isEffortSupported(effort: ThinkingEffort, capabilities: ThinkingCapabilities): boolean {
    return effort === 'auto' || capabilities.efforts.includes(effort);
}

export function isThinkingConfigSupported(
    config: ThinkingConfig,
    capabilities: ThinkingCapabilities | null | undefined,
): boolean {
    if (!capabilities) {
        return true;
    }
    if (config.budgetTokens !== undefined) {
        const range = capabilities.budgetTokens;
        if (!range || !Number.isInteger(config.budgetTokens) || config.budgetTokens < range.min || config.budgetTokens > range.max
            || config.mode === 'disabled' || config.effort !== 'auto') return false;
    }
    return capabilities.modes.includes(config.mode)
        && isEffortSupported(config.effort, capabilities)
        && (config.mode !== 'disabled' || config.effort === 'auto');
}

/** 切换思考开关；关闭时清除等级。 */
export function withThinkingMode(config: ThinkingConfig, mode: ThinkingMode): ThinkingConfig {
    return mode === 'disabled' ? { mode, effort: 'auto' } : { ...config, mode };
}

export function withThinkingEffort(config: ThinkingConfig, effort: ThinkingEffort): ThinkingConfig {
    return config.mode === 'disabled' ? { mode: config.mode, effort: 'auto' }
        : effort === 'auto' ? { ...config, effort } : { mode: config.mode, effort };
}

export function withThinkingBudget(config: ThinkingConfig, budgetTokens: number | undefined): ThinkingConfig {
    if (config.mode === 'disabled') return { mode: config.mode, effort: 'auto' };
    return { mode: config.mode, effort: 'auto', ...(budgetTokens !== undefined ? { budgetTokens } : {}) };
}
