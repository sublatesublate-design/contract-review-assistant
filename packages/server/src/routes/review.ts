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
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    let receivedChars = 0;
    let issueCount = 0;
    let summaryCount = 0;
    let ignoredLineCount = 0;
    let tailIssueIgnored = false;
    let outcome = 'running';
    const logProgress = (event: string) => console.log(`[Review:${requestId}] ${event}`, {
        at: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        receivedChars, issueCount, summaryCount, ignoredLineCount, tailIssueIgnored, outcome,
    });
    const progressTimer = setInterval(() => logProgress('仍在等待或处理'), 30_000);
    progressTimer.unref();
    try {
        console.log(`[Review:${requestId}] 收到请求`, {
            at: new Date().toISOString(),
            documentType: reviewReq.documentType,
            provider: reviewReq.provider,
            model: reviewReq.model,
            contentChars: reviewReq.content.length,
            depth: reviewReq.depth,
            standpoint: reviewReq.standpoint ?? 'neutral',
            customTemplate: Boolean(reviewReq.selectedTemplate),
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
            console.log(`[Review:${requestId}] 合同类型识别:`, contractDetect);
        } else if (reviewReq.documentType === 'litigation' && !reviewReq.selectedTemplate) {
            const litigationDetect = detectLitigationSubtype(reviewReq.content);
            finalDocumentLabel = litigationDetect.label;
            finalLitigationSubtype = litigationDetect.subtype;
            console.log(`[Review:${requestId}] 诉讼文书子类型识别:`, litigationDetect);
        } else if (reviewReq.selectedTemplate) {
            console.log(`[Review:${requestId}] 使用自定义用户模板`);
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

        logProgress('开始调用模型');
        await provider.chatStream(
            [{ role: 'user', content: `请审校以下${LEGAL_DOCUMENT_TYPE_LABELS[reviewReq.documentType as LegalDocumentType] ?? '文稿'}：\n\n${reviewReq.content}` }],
            {
                onDelta: (delta) => {
                    if (delta.length > 0 && receivedChars === 0) logProgress('收到首段正文');
                    receivedChars += delta.length;
                    lineBuffer += delta;
                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const parsed = parseLine(line);
                        if (!parsed) {
                            if (line.trim()) ignoredLineCount++;
                            continue;
                        }

                        if (parsed.type === 'issue') {
                            issueCount++;
                            const issue = toReviewIssue(parsed);
                            sendEvent({ type: 'issue', data: issue });
                        } else if (parsed.type === 'summary') {
                            summaryCount++;
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
                        if (!parsed) ignoredLineCount++;
                        tailIssueIgnored = parsed?.type === 'issue';
                        if (parsed?.type === 'summary') {
                            summaryCount++;
                            sendEvent({
                                type: 'summary',
                                content: parsed.content,
                                model: parsed.model,
                                documentType: reviewReq.documentType,
                                documentLabel: finalDocumentLabel,
                            });
                        }
                    }
                    outcome = 'done';
                    logProgress('模型结束，解析统计');
                    if (summaryCount === 0) {
                        console.warn(`[Review:${requestId}] 未解析到审查总结，当前前端可能仍显示正在审校`);
                    }
                    sendEvent({ type: 'done' });
                    endResponse();
                },
                onError: (err) => {
                    outcome = 'provider-error';
                    logProgress('模型调用失败（错误详情见界面）');
                    sendEvent({ type: 'error', message: err });
                    endResponse();
                },
            },
            systemPrompt,
            aiTools.length > 0 ? aiTools : undefined,
            onToolCall
        );
    } catch (err) {
        outcome = 'exception';
        logProgress('审查异常（错误详情见界面）');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        endResponse();
    } finally {
        clearInterval(progressTimer);
        if (outcome === 'running') outcome = 'returned-without-terminal-event';
        logProgress('审查调用退出');
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
