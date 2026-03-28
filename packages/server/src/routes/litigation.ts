import { Router } from 'express';
import { z } from 'zod';
import { createProvider } from '../services/ai/providerFactory';
import { generateElementComplaint, generateElementPleadingDocx } from '../services/litigation/service';
import { loadTemplateCatalog } from '../services/litigation/templateAssets';

export const litigationRouter: import('express').Router = Router();

const BaseLitigationRequestSchema = z.object({
    content: z.string().min(10, '文书内容不能为空'),
    provider: z.enum(['claude', 'openai', 'ollama']),
    model: z.string().min(1),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
});

const ElementPleadingDocxRequestSchema = BaseLitigationRequestSchema.extend({
    templateId: z.string().min(1, '官方模板不能为空'),
});

litigationRouter.post('/element-complaint', async (req, res) => {
    const parsed = BaseLitigationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    try {
        const provider = createProvider({
            provider: parsed.data.provider,
            model: parsed.data.model,
            apiKey: parsed.data.apiKey,
            baseUrl: parsed.data.baseUrl,
        });

        const result = await generateElementComplaint(provider, parsed.data.content);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : '要素式起诉状转换失败',
        });
    }
});

litigationRouter.get('/element-pleading-templates', (_req, res) => {
    try {
        res.json({ categories: loadTemplateCatalog() });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : '官方模板目录加载失败',
        });
    }
});

litigationRouter.post('/element-pleading-docx', async (req, res) => {
    const parsed = ElementPleadingDocxRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    try {
        const provider = createProvider({
            provider: parsed.data.provider,
            model: parsed.data.model,
            apiKey: parsed.data.apiKey,
            baseUrl: parsed.data.baseUrl,
        });

        const result = await generateElementPleadingDocx(
            provider,
            parsed.data.content,
            parsed.data.templateId,
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : '要素式官方文书生成失败',
        });
    }
});
