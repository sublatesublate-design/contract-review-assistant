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

export type AIModel = 'claude-3-5-sonnet-20241022' | 'claude-3-opus-20240229' | 'gpt-4o' | 'gpt-4-turbo' | string;

export interface ReviewTemplate {
    id: string;                     // 唯一ID (内置: "builtin-sale", 自定义: "ut-12345")
    name: string;                   // 显示名称
    prompt: string;                 // 提示词内容
    isBuiltin: boolean;             // 是否系统内置（不可删除，可恢复默认）
    boundContractType?: string | undefined;     // 绑定的合同类型（auto 模式匹配到此类型时使用此模板）
}

/**
 * 应用设置
 */
export interface AppSettings {
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
