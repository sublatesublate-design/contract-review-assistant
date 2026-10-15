import type { AppSettings } from '../types/settings';

export const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];
export const OPENAI_MODELS = ['gpt-6-astra', 'deepseek-v4-pro', 'deepseek-flash', 'qwen3.7-max', 'qwen3.7-plus', 'kimi-k3', 'glm-5.3', 'mimo-v2.6-pro', 'mimo-v2.6-flash'];

export const DEFAULT_MODELS: AppSettings['models'] = {
    claude: 'claude-sonnet-5-5',
    openai: 'gpt-6-astra',
    ollama: 'qwen3.5:27b',
};

export function upgradeLegacyModels(models: Partial<AppSettings['models']> | undefined, baseUrl?: string): AppSettings['models'] {
    const result = { ...DEFAULT_MODELS, ...models };
    if (result.claude === 'claude-3-5-sonnet-20241022' || result.claude === 'claude-3-7-sonnet-20250219') {
        result.claude = DEFAULT_MODELS.claude;
    } else if (result.claude === 'claude-3-opus-20240229') {
        result.claude = 'claude-opus-5-5';
    }
    if (result.openai === 'gpt-4o' && (!baseUrl || /^https:\/\/api\.openai\.com\/v1\/?$/.test(baseUrl))) {
        result.openai = DEFAULT_MODELS.openai;
    }
    return result;
}
