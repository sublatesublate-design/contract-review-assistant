import { Router } from 'express';
import { z } from 'zod';
import { createProvider } from '../services/ai/providerFactory';
import { mcpManager } from '../services/mcp/mcpManager';
import type { AIToolDefinition } from '../services/ai/types';

export const chatRouter: import('express').Router = Router();

const ChatRequestSchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(['user', 'assistant', 'system']),
            content: z.string(),
        })
    ),
    systemPrompt: z.string().optional(),
    provider: z.enum(['claude', 'openai', 'ollama']),
    model: z.string().min(1),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),   // OpenAI 兼容接口（DeepSeek/本地代理等）
});

/**
 * POST /api/chat
 * SSE 流式对话，支持合同内容作为上下文
 */
chatRouter.post('/', async (req, res) => {
    const parseResult = ChatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }
    const chatReq = parseResult.data;

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const DEFAULT_SYSTEM = `你是一位专业的中国合同法律顾问助手。
请基于用户提供的合同内容回答法律相关问题，提供专业、准确的法律分析。
回答应使用中文，保持专业法律风格，并引用相关法律条款。`;

    try {
        const provider = createProvider({
            provider: chatReq.provider,
            model: chatReq.model,
            apiKey: chatReq.apiKey,
            baseUrl: chatReq.baseUrl,
        });

        // 获取 MCP 工具列表
        const mcpTools = mcpManager.listAllTools();
        const aiTools: AIToolDefinition[] = mcpTools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        }));
        const onToolCall = aiTools.length > 0
            ? (name: string, args: Record<string, unknown>) => mcpManager.callTool(name, args)
            : undefined;

        await provider.chatStream(
            chatReq.messages,
            {
                onDelta: (delta) => sendEvent({ type: 'delta', content: delta }),
                onDone: () => { sendEvent({ type: 'done' }); res.end(); },
                onError: (err) => { sendEvent({ type: 'error', message: err }); res.end(); },
            },
            chatReq.systemPrompt ?? DEFAULT_SYSTEM,
            aiTools.length > 0 ? aiTools : undefined,
            onToolCall
        );
    } catch (err) {
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        res.end();
    }
});

