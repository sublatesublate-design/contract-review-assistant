import type { LegalDocumentType } from './legalDocument';

/**
 * AI 提供商类型
 */
export type ProviderType = 'claude' | 'openai' | 'ollama';

/**
 * 审查深度
 */
/**
 * 审查深度
 */
export type ReviewDepth = 'quick' | 'standard' | 'deep';

/**
 * 审查立场
 */
export type ReviewStandpoint = 'neutral' | 'party_a' | 'party_b';

export type AIModel = string;

/**
 * 思考（reasoning）开关模式
 */
export type ThinkingMode = 'auto' | 'enabled' | 'disabled';

/**
 * 思考强度等级
 */
export type ThinkingEffort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * 思考设置（与后端约定一致）
 */
export interface ThinkingConfig {
    mode: ThinkingMode;
    effort: ThinkingEffort;
    budgetTokens?: number | undefined;
}

/**
 * 某个 provider / model 支持的思考能力
 */
export interface ThinkingCapabilities {
    modes: ThinkingMode[];
    efforts: ThinkingEffort[];
    note: string;
    budgetTokens?: { min: number; max: number } | undefined;
}

export interface ReviewTemplate {
    id: string;                     // 唯一ID (内置: "builtin-sale", 自定义: "ut-12345")
    name: string;                   // 显示名称
    prompt: string;                 // 提示词内容
    isBuiltin: boolean;             // 是否系统内置（不可删除，可恢复默认）
    documentType: LegalDocumentType;
    boundDocumentSubtype?: string | undefined;
    /** @deprecated 兼容旧持久化数据 */
    boundContractType?: string | undefined;
}

/**
 * 应用设置
 */
export interface AppSettings {
    /** 当前默认文书类型 */
    documentType: LegalDocumentType;
    /** 当前选择的 AI 提供商 */
    provider: ProviderType;
    /** 选择的模型 */
    model: AIModel;
    /** 各提供商的 API Key */
    apiKeys: {
        anthropic: string;
        openai: string;
    };
    /** OpenAI 兼容接口地址（Azure 等） */
    baseUrl?: string;
    /** Ollama 服务地址 */
    ollamaBaseUrl?: string;
    /** 选择的模型 (deprecated, but keep for backward compatibility temporarily) */
    models: {
        claude: string;
        openai: string;
        ollama: string;
    };
    /** 思考设置（思考开关 + 等级） */
    thinking: ThinkingConfig;
    /** 全局审查指令 */
    globalInstruction: string;
    /** 统一模板列表（内置 + 自定义） */
    reviewTemplates: ReviewTemplate[];
    /** 审查深度 */
    reviewDepth: ReviewDepth;
    /** 审查立场 */
    standpoint: ReviewStandpoint;
    /** 后端服务地址 */
    serverUrl: string;
    /** 是否记住 API Key（持久化到 localStorage） */
    rememberApiKeys: boolean;
}

/**
 * 可用模型信息
 */
export interface ModelInfo {
    id: string;
    name: string;
    provider: ProviderType;
    description?: string;
    contextWindow?: number;
}
