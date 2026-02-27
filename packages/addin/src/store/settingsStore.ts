import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, ReviewTemplate } from '../types/settings';
import { BUILTIN_TEMPLATES } from '../constants/defaultTemplates';

const DEFAULT_SETTINGS: AppSettings = {
    provider: 'claude',
    model: 'claude-3-5-sonnet-20241022',
    apiKeys: {
        anthropic: '',
        openai: '',
    },
    baseUrl: 'https://api.openai.com/v1',
    ollamaBaseUrl: 'http://localhost:11434',
    models: {
        claude: 'claude-3-5-sonnet-20241022',
        openai: 'gpt-4o',
        ollama: 'qwen2.5:32b',
    },
    globalInstruction: '',
    reviewTemplates: [...BUILTIN_TEMPLATES],
    reviewDepth: 'standard',
    standpoint: 'neutral',
    serverUrl: '',
    rememberApiKeys: false,
};

interface SettingsState {
    settings: AppSettings;
    isSaved: boolean;
    // Actions
    updateSettings: (patch: Partial<AppSettings>) => void;
    updateApiKey: (provider: 'anthropic' | 'openai', key: string) => void;
    addTemplate: (name: string, prompt: string, boundContractType?: string) => void;
    updateTemplate: (id: string, patch: Partial<ReviewTemplate>) => void;
    removeTemplate: (id: string) => void;
    resetBuiltinTemplate: (id: string) => void;
    updateGlobalInstruction: (text: string) => void;
    resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            settings: DEFAULT_SETTINGS,
            isSaved: false,

            updateSettings: (patch) =>
                set((state) => ({
                    settings: { ...state.settings, ...patch },
                    isSaved: false,
                })),

            updateApiKey: (provider, key) =>
                set((state) => ({
                    settings: {
                        ...state.settings,
                        apiKeys: { ...state.settings.apiKeys, [provider]: key },
                    },
                    isSaved: false,
                })),

            addTemplate: (name, prompt, boundContractType) =>
                set((state) => {
                    const newTemplate: ReviewTemplate = {
                        id: `ut-${Date.now()}`,
                        name,
                        prompt,
                        isBuiltin: false,
                        boundContractType
                    };
                    return {
                        settings: {
                            ...state.settings,
                            reviewTemplates: [...state.settings.reviewTemplates, newTemplate],
                        },
                        isSaved: false,
                    };
                }),

            updateTemplate: (id, patch) =>
                set((state) => ({
                    settings: {
                        ...state.settings,
                        reviewTemplates: state.settings.reviewTemplates.map(t =>
                            t.id === id ? { ...t, ...patch } : t
                        ),
                    },
                    isSaved: false,
                })),

            removeTemplate: (id) =>
                set((state) => ({
                    settings: {
                        ...state.settings,
                        reviewTemplates: state.settings.reviewTemplates.filter(t => t.id !== id),
                    },
                    isSaved: false,
                })),

            resetBuiltinTemplate: (id) =>
                set((state) => {
                    const builtin = BUILTIN_TEMPLATES.find(t => t.id === id);
                    if (!builtin) return state;
                    return {
                        settings: {
                            ...state.settings,
                            reviewTemplates: state.settings.reviewTemplates.map(t =>
                                t.id === id ? { ...t, prompt: builtin.prompt } : t
                            ),
                        },
                        isSaved: false,
                    };
                }),

            updateGlobalInstruction: (text) =>
                set((state) => ({
                    settings: { ...state.settings, globalInstruction: text },
                    isSaved: false,
                })),

            resetToDefaults: () =>
                set({ settings: DEFAULT_SETTINGS, isSaved: false }),
        }),
        {
            name: 'contract-review-settings',
            // 版本迁移或初始化时的处理
            merge: (persistedState: any, currentState) => {
                const mergedSettings = { ...currentState.settings, ...persistedState?.settings };

                // 迁移旧格式 -> 新格式
                if (!mergedSettings.reviewTemplates) {
                    const templates = [...BUILTIN_TEMPLATES];

                    // 迁移 customTemplates.typeTemplates
                    if (mergedSettings.customTemplates?.typeTemplates) {
                        for (const [type, prompt] of Object.entries(mergedSettings.customTemplates.typeTemplates)) {
                            const builtin = templates.find(t => t.boundContractType === type);
                            if (builtin && prompt) builtin.prompt = prompt as string;
                        }
                    }

                    // 迁移 userTemplates
                    if (mergedSettings.userTemplates) {
                        for (const ut of mergedSettings.userTemplates) {
                            templates.push({ ...ut, isBuiltin: false });
                        }
                    }

                    mergedSettings.reviewTemplates = templates;
                    mergedSettings.globalInstruction = mergedSettings.customTemplates?.globalInstruction || '';

                    // 清理旧字段
                    delete mergedSettings.customTemplates;
                    delete mergedSettings.userTemplates;
                }

                return {
                    ...currentState,
                    settings: mergedSettings,
                };
            },
            // 根据 rememberApiKeys 决定是否持久化 API Key
            partialize: (state) => ({
                settings: state.settings.rememberApiKeys
                    ? state.settings
                    : { ...state.settings, apiKeys: { anthropic: '', openai: '' } },
            }),
        }
    )
);
