import crypto from 'crypto';
import OpenAI from 'openai';
import type { AIProvider, ChatMessageParam, AIStreamCallbacks, AIToolDefinition, ToolCallHandler } from '../types';

export class OpenAIProvider implements AIProvider {
    readonly name = 'openai';
    readonly model: string;
    private client: OpenAI;
    private baseURL: string;

    constructor(apiKey: string, model = 'gpt-4o', baseURL?: string) {
        this.model = model;
        // 使用原样传入的 baseURL，不要强制追加 /v1，但移除末尾可能的斜杠以防拼接出错
        this.baseURL = baseURL ? baseURL.replace(/\/$/, '') : 'https://api.openai.com/v1';
        console.log(`[OpenAIProvider] 初始化: model=${model}`);
        this.client = new OpenAI({
            apiKey,
            baseURL: this.baseURL,
        });
    }

    async chat(messages: ChatMessageParam[], systemPrompt?: string): Promise<string> {
        const allMessages: OpenAI.ChatCompletionMessageParam[] = [];
        if (systemPrompt) {
            allMessages.push({ role: 'system', content: systemPrompt });
        }
        allMessages.push(
            ...messages.map((m) => ({ role: m.role, content: m.content } as OpenAI.ChatCompletionMessageParam))
        );

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: allMessages,
            max_tokens: 8192,
        });
        return response.choices[0]?.message.content ?? '';
    }

    async chatStream(
        messages: ChatMessageParam[],
        callbacks: AIStreamCallbacks,
        systemPrompt?: string,
        tools?: AIToolDefinition[],
        onToolCall?: ToolCallHandler
    ): Promise<void> {
        const streamId = crypto.randomUUID();
        const startedAt = Date.now();
        let chunkCount = 0;
        let textChars = 0;
        let reasoningChars = 0;
        let roundNumber = 0;
        let finishReason: string | null = null;
        const logStream = (event: string) => console.log(`[OpenAIStream:${streamId}] ${event}`, {
            at: new Date().toISOString(),
            model: this.model,
            elapsedMs: Date.now() - startedAt,
            round: roundNumber, chunkCount, textChars, reasoningChars, finishReason,
        });
        logStream('开始流式调用');
        try {
            // 转为 OpenAI tools 格式
            const openaiTools = tools?.length ? tools.map((t) => ({
                type: 'function' as const,
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema,
                },
            })) : undefined;

            // 构建消息列表
            const allMessages: OpenAI.ChatCompletionMessageParam[] = [];
            if (systemPrompt) {
                allMessages.push({ role: 'system', content: systemPrompt });
            }
            allMessages.push(
                ...messages.map((m) => ({ role: m.role, content: m.content } as OpenAI.ChatCompletionMessageParam))
            );

            // Tool-use 循环：最多 10 轮
            for (let round = 0; round < 10; round++) {
                roundNumber = round + 1;
                finishReason = null;
                logStream('发送本轮请求');
                const stream = await this.client.chat.completions.create({
                    model: this.model,
                    messages: allMessages,
                    max_tokens: 8192,
                    stream: true,
                    ...(openaiTools ? { tools: openaiTools } : {}),
                });
                logStream('已取得上游流');

                let hasToolCalls = false;
                const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

                for await (const chunk of stream) {
                    chunkCount++;
                    if (chunkCount === 1) logStream('收到首个数据包');
                    const choice = chunk.choices[0];
                    if (!choice) continue;

                    if (choice.finish_reason) finishReason = choice.finish_reason;
                    const extraDelta = choice.delta as unknown as Record<string, unknown> | undefined;
                    const reasoning = extraDelta?.['reasoning_content'];
                    if (typeof reasoning === 'string') reasoningChars += reasoning.length;

                    // 文本 delta
                    const delta = choice.delta?.content;
                    if (delta) {
                        if (textChars === 0) logStream('收到首段正文');
                        textChars += delta.length;
                        callbacks.onDelta(delta);
                    }

                    // Tool call delta
                    if (choice.delta?.tool_calls) {
                        hasToolCalls = true;
                        for (const tc of choice.delta.tool_calls) {
                            const existing = toolCalls.get(tc.index);
                            if (existing) {
                                existing.arguments += tc.function?.arguments || '';
                            } else {
                                toolCalls.set(tc.index, {
                                    id: tc.id || '',
                                    name: tc.function?.name || '',
                                    arguments: tc.function?.arguments || '',
                                });
                            }
                        }
                    }
                }
                logStream('本轮流结束');

                // 如果没有工具调用，结束循环
                if (!hasToolCalls || toolCalls.size === 0 || !onToolCall) {
                    break;
                }

                console.log(`[OpenAI] 第 ${round + 1} 轮工具调用，共 ${toolCalls.size} 个工具`);

                // 构建 assistant 的 tool_calls 消息
                const toolCallsArray = Array.from(toolCalls.values());
                allMessages.push({
                    role: 'assistant',
                    content: null,
                    tool_calls: toolCallsArray.map((tc) => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: { name: tc.name, arguments: tc.arguments },
                    })),
                });

                // 执行工具调用并追加结果
                for (const tc of toolCallsArray) {
                    let parsedArgs: Record<string, unknown> = {};
                    try {
                        parsedArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
                    } catch {
                        // 忽略解析错误
                    }

                    const result = await onToolCall(tc.name, parsedArgs);
                    allMessages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: result.content,
                    });
                }
            }

            logStream('流式调用完成');
            callbacks.onDone();
        } catch (err) {
            logStream('流式调用失败');
            // 提取 OpenAI SDK APIError 的完整信息
            if (err instanceof OpenAI.APIError) {
                const detail = `[HTTP ${err.status}] ${err.message}`;
                console.error(`[OpenAIStream:${streamId}] API错误`, {
                    status: err.status ?? null,
                    errorName: err.name,
                });
                callbacks.onError(detail);
            } else {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[OpenAIStream:${streamId}] 非API错误`, {
                    errorName: err instanceof Error ? err.name : typeof err,
                });
                callbacks.onError(msg);
            }
        }
    }
}
