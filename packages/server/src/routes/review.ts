import { Router } from 'express';
import { z } from 'zod';
import { createProvider } from '../services/ai/providerFactory';
import { buildReviewPrompt } from '../services/review/promptBuilder';
import { parseLine, toReviewIssue } from '../services/review/resultParser';
import { detectContractType } from '../services/review/contractDetector';
import { mcpManager } from '../services/mcp/mcpManager';
import type { AIToolDefinition } from '../services/ai/types';

export const reviewRouter: import('express').Router = Router();

const ReviewRequestSchema = z.object({
    content: z.string().min(10, '合同内容不能为空'),
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

/**
 * POST /api/review
 * 以 SSE 流式返回合同审查结果
 * 每发现一个问题，推送 { type: 'issue', data: ReviewIssue }
 * 全部完成后，推送 { type: 'summary', content: '...', model: '...' }
 */
reviewRouter.post('/', async (req, res) => {
    // 验证请求
    const parseResult = ReviewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }
    const reviewReq = parseResult.data;

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // 【调试日志 - 确认后删除】
        console.log('[Review] 收到请求:', {
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

        // 检测合同类型（如果用户没有指定模板）
        const contractDetect = reviewReq.selectedTemplate ? null : detectContractType(reviewReq.content);
        if (contractDetect) {
            console.log('[Review] 合同类型识别:', contractDetect);
        } else {
            console.log('[Review] 使用自定义用户模板:', reviewReq.selectedTemplate?.name);
        }

        const finalContractLabel = reviewReq.selectedTemplate ? reviewReq.selectedTemplate.name : contractDetect!.label;
        const finalContractType = reviewReq.selectedTemplate ? 'custom' : contractDetect!.type;

        const systemPrompt = buildReviewPrompt({
            ...reviewReq,
            contractType: finalContractType as any,
            globalInstruction: reviewReq.globalInstruction,
            selectedTemplate: reviewReq.selectedTemplate
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
            [{ role: 'user', content: `请审查以下合同：\n\n${reviewReq.content}` }],
            {
                onDelta: (delta) => {
                    lineBuffer += delta;
                    // 按换行符分割，处理完整行
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
                                contractType: finalContractType,
                                contractLabel: finalContractLabel,
                            });
                        }
                    }
                },
                onDone: () => {
                    // 处理残留 buffer
                    if (lineBuffer.trim()) {
                        const parsed = parseLine(lineBuffer);
                        if (parsed?.type === 'summary') {
                            sendEvent({ type: 'summary', content: parsed.content, model: parsed.model });
                        }
                    }
                    sendEvent({ type: 'done' });
                    res.end();
                },
                onError: (err) => {
                    sendEvent({ type: 'error', message: err });
                    res.end();
                },
            },
            systemPrompt,
            aiTools.length > 0 ? aiTools : undefined,
            onToolCall
        );
    } catch (err) {
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        res.end();
    }
});
