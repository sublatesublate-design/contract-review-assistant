import { Router } from 'express';
import crypto from 'crypto';
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

// ── EventSource 支持：作业存储 ────
type ChatReqData = z.infer<typeof ChatRequestSchema>;
const chatJobs = new Map<string, { data: ChatReqData; expires: number }>();
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of chatJobs) {
        if (job.expires < now) chatJobs.delete(id);
    }
}, 5 * 60 * 1000);

const DEFAULT_SYSTEM = `你是一位专业的中国合同法律顾问助手。
请基于用户提供的合同内容回答法律相关问题，提供专业、准确的法律分析。
回答应使用中文，保持专业法律风格，并引用相关法律条款。`;

/** 核心对话逻辑（POST 和 GET 端点共用） */
async function executeChat(
    chatReq: ChatReqData,
    sendEvent: (data: unknown) => void,
    endResponse: () => void,
): Promise<void> {
    try {
        const provider = createProvider({
            provider: chatReq.provider,
            model: chatReq.model,
            apiKey: chatReq.apiKey,
            baseUrl: chatReq.baseUrl,
        });

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
                onDone: () => { sendEvent({ type: 'done' }); endResponse(); },
                onError: (err) => { sendEvent({ type: 'error', message: err }); endResponse(); },
            },
            chatReq.systemPrompt ?? DEFAULT_SYSTEM,
            aiTools.length > 0 ? aiTools : undefined,
            onToolCall
        );
    } catch (err) {
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        endResponse();
    }
}

/** 设置 SSE 响应头 */
function setupSSEHeaders(res: import('express').Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
}

/**
 * POST /api/chat — SSE 流式对话（fetch / XHR 消费）
 */
chatRouter.post('/', async (req, res) => {
    const parseResult = ChatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }
    setupSSEHeaders(res);
    const sendEvent = (data: unknown) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
    await executeChat(parseResult.data, sendEvent, () => res.end());
});

/**
 * POST /api/chat/init — 创建对话作业
 */
chatRouter.post('/init', (req, res) => {
    const parseResult = ChatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }
    const jobId = crypto.randomUUID();
    chatJobs.set(jobId, {
        data: parseResult.data,
        expires: Date.now() + 5 * 60 * 1000,
    });
    res.json({ jobId });
});

/**
 * GET /api/chat/stream/:jobId — EventSource 端点（Mac Word WKWebView）
 */
chatRouter.get('/stream/:jobId', async (req, res) => {
    const job = chatJobs.get(req.params['jobId']!);
    if (!job) {
        res.status(404).json({ error: 'Job not found or expired' });
        return;
    }
    chatJobs.delete(req.params['jobId']!);

    setupSSEHeaders(res);
    const sendEvent = (data: unknown) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
    await executeChat(job.data, sendEvent, () => res.end());
});

