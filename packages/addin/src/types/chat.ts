/**
 * 对话消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 单条对话消息
 */
export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    /** 是否正在流式输出中 */
    isStreaming?: boolean;
}

/**
 * 对话会话
 */
export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    createdAt: string;
    /** 是否已注入合同上下文 */
    hasContractContext: boolean;
}
