import { Router } from 'express';
import { OllamaProvider } from '../services/ai/providers/ollamaProvider';
import type { ModelInfo } from '../types/models';
import { z } from 'zod';
import { getThinkingCapabilities } from '../services/ai/thinking';

export const modelsRouter: import('express').Router = Router();

modelsRouter.get('/thinking', (req, res) => {
    const parsed = z.object({ provider: z.enum(['claude', 'openai', 'ollama']), model: z.string().min(1).max(200) }).safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: '需要有效的提供商和模型名称。' });
        return;
    }
    res.json(getThinkingCapabilities(parsed.data.provider, parsed.data.model));
});

/**
 * GET /api/models
 * 返回所有可用模型列表（Claude / OpenAI 固定列表 + Ollama 动态列表）
 */
modelsRouter.get('/', async (_req, res) => {
    const models: ModelInfo[] = [
        // Claude 模型（固定列表）
        { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'claude', contextWindow: 1000000 },
        { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'claude', contextWindow: 1000000 },
        { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', provider: 'claude', contextWindow: 1000000 },

        // OpenAI / 兼容接口模型
        { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'openai', contextWindow: 1050000 },
        { id: 'gpt-6-sol', name: 'GPT-6 Sol', provider: 'openai' },
        { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash（OpenAI 兼容接口）', provider: 'openai' },
        { id: 'grok-4.6', name: 'Grok 4.6', provider: 'openai' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'openai', contextWindow: 1000000 },
        { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', provider: 'openai', contextWindow: 1000000 },
        { id: 'qwen3.7-max', name: 'Qwen 3.7 Max', provider: 'openai' },
        { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', provider: 'openai' },
        { id: 'kimi-k3', name: 'Kimi K3', provider: 'openai', contextWindow: 1000000 },
        { id: 'glm-5.3', name: 'GLM-5.3', provider: 'openai' },
        { id: 'MiniMax-M3', name: 'MiniMax M3', provider: 'openai' },
        { id: 'doubao-seed-2-1-pro-260628', name: '豆包 Seed 2.1 Pro（精确模型 ID）', provider: 'openai' },
        { id: 'step-3.5-flash-2603', name: 'Step 3.5 Flash Agent 优化版', provider: 'openai' },
        { id: 'mimo-v2.6-pro', name: 'MiMo V2.6 Pro', provider: 'openai' },
        { id: 'mimo-v2.6-flash', name: 'MiMo V2.6 Flash', provider: 'openai' },
    ];

    // 动态获取 Ollama 本地模型
    try {
        const ollamaBaseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
        const ollama = new OllamaProvider('', ollamaBaseUrl);
        const ollamaModels = await ollama.listModels();
        ollamaModels.forEach((name) => {
            models.push({ id: name, name: `${name} (本地)`, provider: 'ollama' });
        });
    } catch {
        // Ollama 未安装或未运行，忽略
    }

    res.json(models);
});
