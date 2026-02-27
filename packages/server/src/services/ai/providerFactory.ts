import type { AIProvider } from './types';
import { ClaudeProvider } from './providers/claudeProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { OllamaProvider } from './providers/ollamaProvider';

interface ProviderConfig {
    provider: string;
    model: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;       // OpenAI 兼容接口地址（DeepSeek/本地代理等）
    ollamaBaseUrl?: string | undefined;
}

/**
 * 工厂方法：根据配置实例化对应的 AI Provider
 */
export function createProvider(config: ProviderConfig): AIProvider {
    const { provider, model, apiKey } = config;

    switch (provider) {
        case 'claude': {
            const key = apiKey || process.env['ANTHROPIC_API_KEY'] || '';
            if (!key) throw new Error('Claude 需要 ANTHROPIC_API_KEY');
            return new ClaudeProvider(key, model);
        }

        case 'openai': {
            const key = apiKey || process.env['OPENAI_API_KEY'] || '';
            if (!key) throw new Error('OpenAI 需要 OPENAI_API_KEY');
            const baseURL = config.baseUrl || process.env['OPENAI_BASE_URL'];
            return new OpenAIProvider(key, model, baseURL);
        }

        case 'ollama': {
            const baseUrl = config.ollamaBaseUrl || process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434';
            return new OllamaProvider(model, baseUrl);
        }

        default:
            throw new Error(`未知的 AI Provider: ${provider}。支持: claude / openai / ollama`);
    }
}
