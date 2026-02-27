import type { AIProvider, ChatMessageParam, AIStreamCallbacks, AIToolDefinition, ToolCallHandler } from '../types';

/**
 * Ollama 本地模型 Provider
 * 直接通过 HTTP 调用 Ollama REST API（localhost:11434）
 * Ollama v0.1+ 支持 OpenAI 兼容接口 /api/chat
 */
export class OllamaProvider implements AIProvider {
    readonly name = 'ollama';
    readonly model: string;
    private baseUrl: string;

    constructor(model = 'qwen2.5:32b', baseUrl = 'http://localhost:11434') {
        this.model = model;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async chat(messages: ChatMessageParam[], systemPrompt?: string): Promise<string> {
        const allMessages = this.buildMessages(messages, systemPrompt);

        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                messages: allMessages,
                stream: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as { message?: { content?: string } };
        return data.message?.content ?? '';
    }

    async chatStream(
        messages: ChatMessageParam[],
        callbacks: AIStreamCallbacks,
        systemPrompt?: string,
        _tools?: AIToolDefinition[],
        _onToolCall?: ToolCallHandler
    ): Promise<void> {
        try {
            const allMessages = this.buildMessages(messages, systemPrompt);

            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: allMessages,
                    stream: true,
                }),
            });

            if (!response.ok) {
                throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error('Ollama 响应 body 为空');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter((l) => l.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line) as {
                            message?: { content?: string };
                            done?: boolean;
                        };
                        if (data.message?.content) {
                            callbacks.onDelta(data.message.content);
                        }
                        if (data.done) {
                            callbacks.onDone();
                            return;
                        }
                    } catch {
                        // 忽略非 JSON 行
                    }
                }
            }

            callbacks.onDone();
        } catch (err) {
            callbacks.onError(err instanceof Error ? err.message : String(err));
        }
    }

    /** 获取 Ollama 本地已安装的模型列表 */
    async listModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return [];
            const data = (await response.json()) as { models?: Array<{ name: string }> };
            return data.models?.map((m) => m.name) ?? [];
        } catch {
            return [];
        }
    }

    private buildMessages(
        messages: ChatMessageParam[],
        systemPrompt?: string
    ): Array<{ role: string; content: string }> {
        const result: Array<{ role: string; content: string }> = [];
        if (systemPrompt) {
            result.push({ role: 'system', content: systemPrompt });
        }
        result.push(...messages.map((m) => ({ role: m.role, content: m.content })));
        return result;
    }
}
