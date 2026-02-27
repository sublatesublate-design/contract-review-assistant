import { Router } from 'express';
import { z } from 'zod';
import { createProvider } from '../services/ai/providerFactory';

export const summaryRouter: import('express').Router = Router();

const SummaryRequestSchema = z.object({
    content: z.string().min(10, '合同内容不能为空'),
    provider: z.enum(['claude', 'openai', 'ollama']),
    model: z.string().min(1),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
});

/**
 * POST /api/summary
 * 非流式端点，返回合同结构化信息的 JSON
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

        const systemPrompt = `你是一个专业的法律助手。请从用户提供的合同中提取以下结构化信息，并严格按照以下 JSON 格式输出（不要输出任何 Markdown 标记、思考过程或其他文本）：

{
  "parties": [{"role": "甲方", "name": "XX公司"}, {"role": "乙方", "name": "YY公司"}],
  "contractType": "买卖合同/服务合同/租赁合同等",
  "amount": "人民币100万元（如果没有则填无）",
  "duration": "2024年1月1日至2025年12月31日（如果没有明确日期则尽量概括）",
  "keyDates": ["2024/3/1 首批交货", "关键时间点描述..."],
  "coreObligations": ["甲方按期付款", "乙方保证产品质量", "核心义务..."],
  "disputeResolution": "北京仲裁委员会仲裁 / 某某法院管辖等"
}

如果某些信息未在合同中体现，请填入"未见明确约定"或相应的空数组。请确保输出内容是合法的 JSON。`;

        const responseText = await provider.chat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: summaryReq.content }
            ]
        );

        // 尝试解析 JSON（以防模型多输出了 markdown block）
        let jsonStr = responseText.trim();
        if (jsonStr.startsWith('\`\`\`json')) {
            jsonStr = jsonStr.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
        } else if (jsonStr.startsWith('\`\`\`')) {
            jsonStr = jsonStr.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
        }

        try {
            const summaryObj = JSON.parse(jsonStr);
            res.json(summaryObj);
        } catch (e) {
            console.error('[Summary] 解析 JSON 失败:', jsonStr);
            res.status(500).json({ error: '模型返回的内容不是有效的 JSON', content: jsonStr });
        }
    } catch (err) {
        console.error('[Summary] Error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : '提取摘要失败' });
    }
});
