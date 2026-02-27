import { Router } from 'express';
import { OllamaProvider } from '../services/ai/providers/ollamaProvider';
import type { ModelInfo } from '../types/models';

export const modelsRouter: import('express').Router = Router();

/**
 * GET /api/models
 * 返回所有可用模型列表（Claude / OpenAI 固定列表 + Ollama 动态列表）
 */
modelsRouter.get('/', async (_req, res) => {
    const models: ModelInfo[] = [
        // Claude 模型（固定列表）
        { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'claude', contextWindow: 200000 },
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'claude', contextWindow: 200000 },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5（快速/低成本）', provider: 'claude', contextWindow: 200000 },

        // OpenAI / 兼容接口模型
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o mini（低成本）', provider: 'openai', contextWindow: 128000 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', contextWindow: 128000 },
        { id: 'deepseek-chat', name: 'DeepSeek Chat（兼容接口）', provider: 'openai', contextWindow: 64000 },
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
