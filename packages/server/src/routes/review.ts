import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { createProvider } from '../services/ai/providerFactory';
import { buildReviewPrompt } from '../services/review/promptBuilder';
import { parseLine, toReviewIssue } from '../services/review/resultParser';
import { detectContractType } from '../services/review/contractDetector';
import { detectLitigationSubtype } from '../services/review/litigationDetector';
import { DEFAULT_REVIEW_LABELS, LEGAL_DOCUMENT_TYPE_LABELS } from '../services/review/legalWritingConfig';
import { mcpManager } from '../services/mcp/mcpManager';
import type { AIToolDefinition } from '../services/ai/types';
import type { LegalDocumentType } from '../types/legalDocument';

export const reviewRouter: import('express').Router = Router();

const ReviewRequestSchema = z.object({
    content: z.string().min(10, '文稿内容不能为空'),
    documentType: z.enum(['contract', 'litigation', 'legal_opinion']).default('contract'),
    provider: z.enum(['claude', 'openai', 'ollama']),
    model: z.string().min(1),
    depth: z.enum(['quick', 'standard', 'deep']).default('standard'),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),   // OpenAI 兼容接口（DeepSeek/本地代理等）
    globalInstruction: z.string().optional(),
    standpoint: z.enum(['neutral', 'party_a', 'party_b']).optional(),
    selectedTemplate: z.object({
        name: z.string(),
        prompt: z.string(),
    }).optional(),
});

// ── EventSource 支持：作业存储（Mac Word WKWebView 需要 GET 端点） ────
type ReviewReqData = z.infer<typeof ReviewRequestSchema>;
const reviewJobs = new Map<string, { data: ReviewReqData; expires: number }>();
// 每 5 分钟清理过期作业
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of reviewJobs) {
        if (job.expires < now) reviewJobs.delete(id);
    }
}, 5 * 60 * 1000);

/** 核心审查逻辑：发送 SSE 事件流（POST 和 GET 端点共用） */
async function executeReview(
    reviewReq: ReviewReqData,
    sendEvent: (data: unknown) => void,
    endResponse: () => void,
): Promise<void> {
    try {
        console.log('[Review] 收到请求:', {
            documentType: reviewReq.documentType,
            provider: reviewReq.provider,
            model: reviewReq.model,
            baseUrl: reviewReq.baseUrl ?? '(未传入)',
            apiKeyPrefix: reviewReq.apiKey?.slice(0, 8) ?? '(无)',
        });

        const provider = createProvider({
            provider: reviewReq.provider,
            model: reviewReq.model,
            apiKey: reviewReq.apiKey,
            baseUrl: reviewReq.baseUrl,
        });

        let finalDocumentLabel = reviewReq.selectedTemplate
            ? reviewReq.selectedTemplate.name
            : DEFAULT_REVIEW_LABELS[reviewReq.documentType as LegalDocumentType];
        let finalContractType: ReturnType<typeof detectContractType>['type'] | 'custom' | undefined;
        let finalLitigationSubtype: ReturnType<typeof detectLitigationSubtype>['subtype'] | undefined;

        if (reviewReq.documentType === 'contract' && !reviewReq.selectedTemplate) {
            const contractDetect = detectContractType(reviewReq.content);
            finalDocumentLabel = contractDetect.label;
            finalContractType = contractDetect.type;
            console.log('[Review] 合同类型识别:', contractDetect);
        } else if (reviewReq.documentType === 'litigation' && !reviewReq.selectedTemplate) {
            const litigationDetect = detectLitigationSubtype(reviewReq.content);
            finalDocumentLabel = litigationDetect.label;
            finalLitigationSubtype = litigationDetect.subtype;
            console.log('[Review] 诉讼文书子类型识别:', litigationDetect);
        } else if (reviewReq.selectedTemplate) {
            console.log('[Review] 使用自定义用户模板:', reviewReq.selectedTemplate.name);
            finalContractType = 'custom';
        }

        const systemPrompt = buildReviewPrompt({
            ...reviewReq,
            ...(finalContractType ? { contractType: finalContractType } : {}),
            ...(finalLitigationSubtype ? { litigationSubtype: finalLitigationSubtype } : {}),
            ...(reviewReq.globalInstruction ? { globalInstruction: reviewReq.globalInstruction } : {}),
            ...(reviewReq.selectedTemplate ? { selectedTemplate: reviewReq.selectedTemplate } : {}),
        });
        let lineBuffer = '';

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
            [{ role: 'user', content: `请审校以下${LEGAL_DOCUMENT_TYPE_LABELS[reviewReq.documentType as LegalDocumentType] ?? '文稿'}：\n\n${reviewReq.content}` }],
            {
                onDelta: (delta) => {
                    lineBuffer += delta;
                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const parsed = parseLine(line);
                        if (!parsed) continue;

                        if (parsed.type === 'issue') {
                            const issue = toReviewIssue(parsed);
                            sendEvent({ type: 'issue', data: issue });
                        } else if (parsed.type === 'summary') {
                            sendEvent({
                                type: 'summary',
                                content: parsed.content,
                                model: parsed.model,
                                documentType: reviewReq.documentType,
                                documentLabel: finalDocumentLabel,
                            });
                        }
                    }
                },
                onDone: () => {
                    if (lineBuffer.trim()) {
                        const parsed = parseLine(lineBuffer);
                        if (parsed?.type === 'summary') {
                            sendEvent({
                                type: 'summary',
                                content: parsed.content,
                                model: parsed.model,
                                documentType: reviewReq.documentType,
                                documentLabel: finalDocumentLabel,
                            });
                        }
                    }
                    sendEvent({ type: 'done' });
                    endResponse();
                },
                onError: (err) => {
                    sendEvent({ type: 'error', message: err });
                    endResponse();
                },
            },
            systemPrompt,
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
 * POST /api/review
 * 以 SSE 流式返回合同审查结果（fetch / XHR 消费）
 */
reviewRouter.post('/', async (req, res) => {
    const parseResult = ReviewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }
    setupSSEHeaders(res);
    const sendEvent = (data: unknown) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
    await executeReview(parseResult.data, sendEvent, () => res.end());
});

/**
 * POST /api/review/init
 * 创建审查作业，返回 jobId（配合 EventSource GET 端点使用）
 */
reviewRouter.post('/init', (req, res) => {
    const parseResult = ReviewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }
    const jobId = crypto.randomUUID();
    reviewJobs.set(jobId, {
        data: parseResult.data,
        expires: Date.now() + 5 * 60 * 1000, // 5 分钟有效期
    });
    res.json({ jobId });
});

/**
 * GET /api/review/stream/:jobId
 * EventSource 端点 —— Mac Word WKWebView 专用
 * 原生 EventSource API 可在 WKWebView 中正确流式输出
 */
reviewRouter.get('/stream/:jobId', async (req, res) => {
    const job = reviewJobs.get(req.params['jobId']!);
    if (!job) {
        res.status(404).json({ error: 'Job not found or expired' });
        return;
    }
    reviewJobs.delete(req.params['jobId']!);

    setupSSEHeaders(res);
    const sendEvent = (data: unknown) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
    await executeReview(job.data, sendEvent, () => res.end());
});
