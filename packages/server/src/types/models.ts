/**
 * 后端模型信息类型（供 routes/models.ts 使用）
 */
export interface ModelInfo {
    id: string;
    name: string;
    provider: 'claude' | 'openai' | 'ollama';
    description?: string;
    contextWindow?: number;
}
