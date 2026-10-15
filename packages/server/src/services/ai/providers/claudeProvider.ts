import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ChatMessageParam, AIStreamCallbacks, AIToolDefinition, ToolCallHandler } from '../types';
import { resolveThinkingOptions, type ThinkingConfig } from '../thinking';

export class ClaudeProvider implements AIProvider {
    readonly name = 'claude';
    readonly model: string;
    private client: Anthropic;
    private maxTokens: number;
    private thinkingOptions: Record<string, unknown>;

    constructor(apiKey: string, model = 'claude-sonnet-5-5', thinking?: ThinkingConfig) {
        this.model = model;
        this.thinkingOptions = resolveThinkingOptions('claude', model, thinking);
        this.maxTokens = model.startsWith('claude-3-5-') ? 8192
            : /^claude-3-(opus|sonnet|haiku)-/.test(model) ? 4096
            : /^claude-opus-4(?:-1)?(?:-\d{8})?$/.test(model) ? 32000
            : 64000;
        this.client = new Anthropic({ apiKey });
    }

    async chat(messages: ChatMessageParam[], systemPrompt?: string): Promise<string> {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            ...this.thinkingOptions,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: messages.filter((m) => m.role !== 'system').map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
        });
        return response.content.filter((block) => block.type === 'text').map((block) => block.type === 'text' ? block.text : '').join('');
    }

    async chatStream(
        messages: ChatMessageParam[],
        callbacks: AIStreamCallbacks,
        systemPrompt?: string,
        tools?: AIToolDefinition[],
        onToolCall?: ToolCallHandler
    ): Promise<void> {
        try {
            // 将 tools 转为 Claude 格式
            const claudeTools = tools?.length ? tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
            })) : undefined;

            // 构建对话消息（需要支持多轮 tool-use）
            const conversationMessages: Anthropic.MessageParam[] = messages
                .filter((m) => m.role !== 'system')
                .map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }));

            // Tool-use 循环：最多 10 轮工具调用
            for (let round = 0; round < 10; round++) {
                const stream = await this.client.messages.create({
                    model: this.model,
                    max_tokens: this.maxTokens,
                    ...this.thinkingOptions,
                    ...(systemPrompt ? { system: systemPrompt } : {}),
                    messages: conversationMessages,
                    ...(claudeTools ? { tools: claudeTools } : {}),
                    stream: true,
                });

                let hasToolUse = false;
                const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
                let currentToolId = '';
                let currentToolName = '';
                let currentToolInput = '';
                const assistantBlocks: Record<string, unknown>[] = [];
                let currentBlock: Record<string, unknown> | undefined;

                for await (const event of stream) {
                    if (event.type === 'content_block_start') {
                        currentBlock = { ...event.content_block };
                        assistantBlocks.push(currentBlock);
                        if (event.content_block.type === 'tool_use') {
                            hasToolUse = true;
                            currentToolId = event.content_block.id;
                            currentToolName = event.content_block.name;
                            currentToolInput = '';
                        }
                    } else if (event.type === 'content_block_delta') {
                        if (event.delta.type === 'text_delta') {
                            if (currentBlock) currentBlock['text'] = String(currentBlock['text'] ?? '') + event.delta.text;
                            callbacks.onDelta(event.delta.text);
                        } else if (event.delta.type === 'input_json_delta') {
                            currentToolInput += event.delta.partial_json;
                        } else {
                            const delta = event.delta as unknown as Record<string, unknown>;
                            if (currentBlock && delta['type'] === 'thinking_delta') {
                                currentBlock['thinking'] = String(currentBlock['thinking'] ?? '') + String(delta['thinking'] ?? '');
                            } else if (currentBlock && delta['type'] === 'signature_delta') {
                                currentBlock['signature'] = String(currentBlock['signature'] ?? '') + String(delta['signature'] ?? '');
                            }
                        }
                    } else if (event.type === 'content_block_stop') {
                        if (currentToolId) {
                            try {
                                const parsedInput = currentToolInput ? JSON.parse(currentToolInput) : currentBlock?.['input'] ?? {};
                                if (currentBlock) currentBlock['input'] = parsedInput;
                                toolUseBlocks.push({
                                    id: currentToolId,
                                    name: currentToolName,
                                    input: parsedInput as Record<string, unknown>,
                                });
                            } catch {
                                if (currentBlock) currentBlock['input'] = {};
                                toolUseBlocks.push({
                                    id: currentToolId,
                                    name: currentToolName,
                                    input: {},
                                });
                            }
                            currentToolId = '';
                        }
                        currentBlock = undefined;
                    }
                }

                // 如果没有工具调用，结束循环
                if (!hasToolUse || toolUseBlocks.length === 0 || !onToolCall) {
                    break;
                }

                // 执行工具调用并将结果追加到对话中
                console.log(`[Claude] 第 ${round + 1} 轮工具调用，共 ${toolUseBlocks.length} 个工具`);

                // 追加 assistant 的 tool_use 消息
                conversationMessages.push({
                    role: 'assistant',
                    content: assistantBlocks as unknown as Exclude<Anthropic.MessageParam['content'], string>,
                });

                // 执行所有工具调用并构建 tool_result
                const toolResults: Anthropic.ToolResultBlockParam[] = [];
                for (const tb of toolUseBlocks) {
                    const result = await onToolCall(tb.name, tb.input);
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tb.id,
                        content: result.content,
                        ...(result.isError ? { is_error: true } : {}),
                    });
                }

                // 追加 user 的 tool_result 消息
                conversationMessages.push({
                    role: 'user',
                    content: toolResults,
                });
            }

            callbacks.onDone();
        } catch (err) {
            callbacks.onError(err instanceof Error ? err.message : String(err));
        }
    }
}
