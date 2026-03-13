import { Router } from 'express';
import { z } from 'zod';
import { createProvider } from '../services/ai/providerFactory';
import type { LegalDocumentType } from '../types/legalDocument';
import { LEGAL_DOCUMENT_TYPE_LABELS } from '../services/review/legalWritingConfig';

export const summaryRouter: import('express').Router = Router();

const SummaryRequestSchema = z.object({
    content: z.string().min(10, '文稿内容不能为空'),
    documentType: z.enum(['contract', 'litigation', 'legal_opinion']).default('contract'),
    provider: z.enum(['claude', 'openai', 'ollama']),
    model: z.string().min(1),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
});

function buildSummaryPrompt(documentType: LegalDocumentType): string {
    const label = LEGAL_DOCUMENT_TYPE_LABELS[documentType];
    const modeSpecificInstructions: Record<LegalDocumentType, string> = {
        contract: `请重点提取：
- 合同类型、核心当事人、关键金额、履行期限、争议解决
- 关键日期或关键履约节点
- 核心权利义务或风险焦点`,
        litigation: `请重点提取：
- 文书类型、案由、当前立场、核心请求或核心抗辩
- 关键事实时间线
- 证据基础、争议焦点或对抗点`,
        legal_opinion: `请重点提取：
- 意见书类型、项目背景、核心结论、适用时点
- 核心假设前提
- 主要法律依据、保留事项或免责声明`,
    };

    return `你是一位专业法律写作助手。请从用户提供的${label}中提取结构化摘要，并严格按照以下 JSON 输出，不要输出 Markdown、解释或任何额外文字：

{
  "title": "${label}关键摘要",
  "overview": "一句话概括文稿内容或当前焦点",
  "fields": [
    { "label": "字段名", "value": "字段值" }
  ],
  "sections": [
    { "title": "章节名", "items": ["要点1", "要点2"] }
  ]
}

规则：
1. fields 建议输出 3-5 项，每项必须是简短、可读的标签和值。
2. sections 建议输出 2-4 组，每组 items 为 0-5 条。
3. 没有明确内容时，用 "未见明确约定" 或空数组。
4. 输出必须是合法 JSON。

${modeSpecificInstructions[documentType]}`;
}

/**
 * POST /api/summary
 * 非流式端点，返回通用结构化摘要 JSON
 */
summaryRouter.post('/', async (req, res) => {
    try {
        const parsed = SummaryRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: '无效的请求参数', details: parsed.error.issues });
            return;
        }

        const summaryReq = parsed.data;
        const provider = createProvider({
            provider: summaryReq.provider,
            model: summaryReq.model,
            apiKey: summaryReq.apiKey,
            baseUrl: summaryReq.baseUrl,
        });

        const responseText = await provider.chat(
            [
                { role: 'system', content: buildSummaryPrompt(summaryReq.documentType) },
                { role: 'user', content: summaryReq.content }
            ]
        );

        let jsonStr = responseText.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
        }

        try {
            const summaryObj = JSON.parse(jsonStr);
            res.json(summaryObj);
        } catch {
            console.error('[Summary] 解析 JSON 失败:', jsonStr);
            res.status(500).json({ error: '模型返回的内容不是有效的 JSON', content: jsonStr });
        }
    } catch (err) {
        console.error('[Summary] Error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : '提取摘要失败' });
    }
});
