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
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'claude', contextWindow: 1000000 },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'claude', contextWindow: 1000000 },

        // OpenAI / 兼容接口模型
        { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', contextWindow: 400000 },
        { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai', contextWindow: 400000 },
        { id: 'deepseek-chat', name: 'DeepSeek V3.2 Chat', provider: 'openai', contextWindow: 128000 },
        { id: 'deepseek-reasoner', name: 'DeepSeek V3.2 Reasoner', provider: 'openai', contextWindow: 128000 },
        { id: 'qwen3.5-max', name: 'Qwen 3.5 Max', provider: 'openai', contextWindow: 1000000 },
        { id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'openai', contextWindow: 2000000 },
        { id: 'glm-5-plus', name: 'GLM 5 Plus', provider: 'openai', contextWindow: 1000000 },
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
