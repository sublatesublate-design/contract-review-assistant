/**
 * AI Provider 统一接口定义
 */

export interface ChatMessageParam {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AIStreamCallbacks {
    onDelta: (delta: string) => void;
    onDone: () => void;
    onError: (err: string) => void;
}

/** 工具定义（传给 AI SDK） */
export interface AIToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

/** 工具调用处理器：接收工具名和参数，返回结果 */
export type ToolCallHandler = (
    toolName: string,
    args: Record<string, unknown>
) => Promise<{ content: string; isError?: boolean }>;

/**
 * 所有 AI Provider 必须实现的接口
 */
export interface AIProvider {
    readonly name: string;
    readonly model: string;

    /**
     * 非流式对话
     */
    chat(messages: ChatMessageParam[], systemPrompt?: string): Promise<string>;

    /**
     * 流式对话（SSE）
     * @param tools      可选，MCP 工具列表
     * @param onToolCall 可选，工具调用处理器
     */
    chatStream(
        messages: ChatMessageParam[],
        callbacks: AIStreamCallbacks,
        systemPrompt?: string,
        tools?: AIToolDefinition[],
        onToolCall?: ToolCallHandler
    ): Promise<void>;
}

/**
 * Review 专用请求参数
 */
export interface ReviewRequest {
    content: string;        // 合同全文
    provider: string;       // claude | openai | ollama
    model: string;
    depth: 'quick' | 'standard' | 'deep';
    apiKey?: string | undefined;
    baseUrl?: string | undefined;   // OpenAI 兼容接口地址（DeepSeek/本地代理等）
}

/**
 * Chat 专用请求参数
 */
export interface ChatRequest {
    messages: ChatMessageParam[];
    systemPrompt?: string;
    provider: string;
    model: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;   // OpenAI 兼容接口地址（DeepSeek/本地代理等）
}
