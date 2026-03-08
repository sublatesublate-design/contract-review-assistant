import React, { useState, useEffect, useCallback, memo } from 'react';
import { Save, RefreshCw, Eye, EyeOff, Server, Cpu, KeyRound, BookText, Plus, Edit2, Trash2, Check, X, Plug, Unplug, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { useSettingsStore } from '../../../store/settingsStore';
import type { AppSettings, ProviderType, ReviewDepth, ReviewTemplate } from '../../../types/settings';
import { apiClient } from '../../../services/apiClient';
import type { McpServerStatus, McpServerConfig } from '../../../services/apiClient';
import { CONTRACT_TYPE_OPTIONS, ContractType, getDefaultTemplatePrompt } from '../../../constants/defaultTemplates';

const PROVIDERS: { id: ProviderType; label: string; description: string }[] = [
    { id: 'claude', label: 'Anthropic', description: 'Claude 系列模型' },
    { id: 'openai', label: 'OpenAI', description: 'GPT 系列及兼容接口（DeepSeek 等）' },
    { id: 'ollama', label: 'Ollama（本地）', description: '完全离线，保护数据安全' },
];

const CLAUDE_MODELS = ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
const OPENAI_MODELS = ['gpt-5.2', 'deepseek-chat', 'deepseek-reasoner', 'qwen3.5-max', 'kimi-k2.5', 'glm-5-plus'];
const DEPTH_OPTIONS: { id: ReviewDepth; label: string; description: string }[] = [
    { id: 'quick', label: '快速审查', description: '约 30s，关注主要风险条款' },
    { id: 'standard', label: '标准审查', description: '约 1-2min，四维度全面分析' },
    { id: 'deep', label: '深度审查', description: '约 3-5min，逐段精细分析' },
];

const STANDPOINT_OPTIONS: { id: 'neutral' | 'party_a' | 'party_b'; label: string; description: string }[] = [
    { id: 'neutral', label: '中立视角', description: '基于公平衡平原则，客观指出双方风险' },
    { id: 'party_a', label: '甲方视角', description: '聚焦甲方权益保护，重点审查对甲方不利条款' },
    { id: 'party_b', label: '乙方视角', description: '聚焦乙方权益保护，防范对乙方过于苛刻的义务' },
];

export default function SettingsPanel() {
    const {
        settings, updateSettings, updateApiKey, addTemplate,
        updateTemplate, removeTemplate, resetBuiltinTemplate,
        updateGlobalInstruction, resetToDefaults
    } = useSettingsStore();

    // 🏆 V2 核心改进：引入局部草稿状态，彻底解耦输入与持久化 I/O
    const [draftSettings, setDraftSettings] = useState<Partial<AppSettings>>({});
    const [saved, setSaved] = useState(false);

    // 初始化草稿
    useEffect(() => {
        setDraftSettings(settings);
    }, [settings]);

    const handleSave = () => {
        // 只有在这里点击才会触发 Zustand 的 set(persist) 逻辑，即 localStorage 写入
        updateSettings(draftSettings as Partial<AppSettings>); // Cast to AppSettings as draftSettings will be complete on save
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const updateDraft = (patch: Partial<AppSettings>) => {
        setDraftSettings(prev => ({ ...prev, ...patch }));
    };

    const updateDraftApiKey = (provider: 'anthropic' | 'openai', key: string) => {
        setDraftSettings(prev => ({
            ...prev,
            apiKeys: { ...(prev.apiKeys || settings.apiKeys), [provider]: key } as any
        }));
    };

    // Use draftSettings values if available, otherwise fallback to global settings
    const currentProvider = draftSettings.provider || settings.provider;
    const currentApiKeys = draftSettings.apiKeys || settings.apiKeys;
    const currentModels = draftSettings.models || settings.models;
    const currentBaseUrl: string = (draftSettings.baseUrl !== undefined ? draftSettings.baseUrl : settings.baseUrl) || '';
    const currentRemember: boolean = draftSettings.rememberApiKeys !== undefined ? draftSettings.rememberApiKeys : settings.rememberApiKeys;

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="p-3 space-y-4">
                {/* 拆分为子组件以利用组件化渲染隔离性能 */}
                <ProviderSection
                    provider={currentProvider}
                    onChange={(p: ProviderType) => updateDraft({ provider: p })}
                />

                {currentProvider !== 'ollama' && (
                    <ApiKeySection
                        provider={currentProvider}
                        apiKeys={currentApiKeys}
                        models={currentModels}
                        baseUrl={currentBaseUrl}
                        rememberApiKeys={currentRemember}
                        onApiKeyChange={updateDraftApiKey}
                        onSettingsChange={updateDraft}
                    />
                )}

                {currentProvider === 'ollama' && (
                    <OllamaSection
                        ollamaBaseUrl={(draftSettings.ollamaBaseUrl !== undefined ? draftSettings.ollamaBaseUrl : settings.ollamaBaseUrl) || ''}
                        ollamaModel={currentModels.ollama || ''}
                        models={currentModels}
                        serverUrl={settings.serverUrl}
                        onSettingsChange={updateDraft}
                    />
                )}

                <DepthSection
                    reviewDepth={draftSettings.reviewDepth || settings.reviewDepth}
                    onChange={(d: ReviewDepth) => updateDraft({ reviewDepth: d })}
                />

                <StandpointSection
                    standpoint={draftSettings.standpoint || settings.standpoint}
                    onChange={(s: 'neutral' | 'party_a' | 'party_b') => updateDraft({ standpoint: s })}
                />

                <TemplateSection
                    reviewTemplates={settings.reviewTemplates} // Templates are managed directly by Zustand actions
                    globalInstruction={draftSettings.globalInstruction !== undefined ? draftSettings.globalInstruction : settings.globalInstruction}
                    addTemplate={addTemplate}
                    updateTemplate={updateTemplate}
                    removeTemplate={removeTemplate}
                    resetBuiltinTemplate={resetBuiltinTemplate}
                    onGlobalInstructionChange={(val: string) => updateDraft({ globalInstruction: val })}
                />

                <McpSection serverUrl={settings.serverUrl} /> {/* MCP section does not use draft settings */}

                <ServerSection
                    serverUrl={draftSettings.serverUrl !== undefined ? draftSettings.serverUrl : settings.serverUrl}
                    onChange={(val: string) => updateDraft({ serverUrl: val })}
                />

                <div className="sticky bottom-0 bg-white pt-2 pb-4 border-t mt-4 flex gap-2">
                    <button
                        onClick={handleSave}
                        className={clsx(
                            'btn-primary flex-1 text-sm font-semibold py-2.5 flex items-center justify-center gap-2 shadow-md transition-all active:scale-95',
                            saved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary-600 hover:bg-primary-700'
                        )}
                    >
                        <Save size={14} />
                        {saved ? '已保存已同步 ✓' : '保存设置并同步'}
                    </button>
                    <button onClick={resetToDefaults} className="btn-secondary text-sm px-4 flex items-center gap-1.5 border-gray-200">
                        <RefreshCw size={13} />
                        重置
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 text-center italic">修改后请点击“保存”以确保持久化到本地</p>
            </div>
        </div>
    );
}

// ── 子组件拆分 (针对 WPS Mac 渲染性能瓶颈进行隔离) ──────────────────────────

const ProviderSection = memo(({ provider, onChange }: { provider: ProviderType; onChange: (p: ProviderType) => void }) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI 提供商</h2>
        <div className="space-y-1.5">
            {PROVIDERS.map((p) => (
                <label
                    key={p.id}
                    className={clsx(
                        'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors',
                        provider === p.id
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                >
                    <input
                        type="radio"
                        name="provider"
                        checked={provider === p.id}
                        onChange={() => onChange(p.id)}
                        className="mt-0.5 accent-primary-600"
                    />
                    <div>
                        <p className="text-xs font-medium text-gray-800">{p.label}</p>
                        <p className="text-xs text-gray-400">{p.description}</p>
                    </div>
                </label>
            ))}
        </div>
    </section>
));

const ApiKeySection = memo(({ provider, apiKeys, models, baseUrl, rememberApiKeys, onApiKeyChange, onSettingsChange }: {
    provider: ProviderType;
    apiKeys: { anthropic: string; openai: string };
    models: { claude: string; openai: string; ollama: string };
    baseUrl: string;
    rememberApiKeys: boolean;
    onApiKeyChange: (provider: 'anthropic' | 'openai', key: string) => void;
    onSettingsChange: (patch: Partial<AppSettings>) => void;
}) => {
    const [showKey, setShowKey] = useState(false);

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">API Key 配置</h2>
                <div className="space-y-3">
                    {provider === 'claude' ? (
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-600">Anthropic API Key</label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKeys.anthropic || ''}
                                    onChange={(e) => onApiKeyChange('anthropic', e.target.value)}
                                    placeholder="sk-ant-..."
                                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-400"
                                />
                                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>
                            <div className="mt-2">
                                <label className="text-xs text-gray-600">模型</label>
                                <input
                                    value={models.claude || ''}
                                    onChange={(e) => onSettingsChange({ models: { ...models, claude: e.target.value } })}
                                    placeholder="例如：claude-3-7-sonnet-20250219"
                                    list="claude-models-list"
                                    className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                                />
                                <datalist id="claude-models-list">
                                    {CLAUDE_MODELS.map((m) => <option key={m} value={m} />)}
                                </datalist>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-600">OpenAI API Key</label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKeys.openai || ''}
                                    onChange={(e) => onApiKeyChange('openai', e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-400"
                                />
                                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>
                            <label className="text-xs text-gray-600 mt-2 block">API Base URL（兼容接口）</label>
                            <input
                                value={baseUrl || ''}
                                onChange={(e) => onSettingsChange({ baseUrl: e.target.value })}
                                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                            />
                            <div className="mt-2">
                                <label className="text-xs text-gray-600">模型</label>
                                <input
                                    value={models.openai || ''}
                                    onChange={(e) => onSettingsChange({ models: { ...models, openai: e.target.value } })}
                                    placeholder="例如：gpt-4o 或 deepseek-chat"
                                    list="openai-models-list"
                                    className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                                />
                                <datalist id="openai-models-list">
                                    {OPENAI_MODELS.map((m) => <option key={m} value={m} />)}
                                </datalist>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2.5 px-1">
                <input
                    type="checkbox"
                    id="remember-api-key"
                    checked={rememberApiKeys || false}
                    onChange={(e) => onSettingsChange({ rememberApiKeys: e.target.checked })}
                    className="accent-primary-600 w-3.5 h-3.5 cursor-pointer"
                />
                <label htmlFor="remember-api-key" className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                    <KeyRound size={11} className="text-gray-400" />
                    记住密钥（存储在本机，关闭则刷新后清空）
                </label>
            </div>
        </section>
    );
});

const OllamaSection = memo(({ ollamaBaseUrl, ollamaModel, models, serverUrl, onSettingsChange }: {
    ollamaBaseUrl: string;
    ollamaModel: string;
    models: { claude: string; openai: string; ollama: string };
    serverUrl: string;
    onSettingsChange: (patch: Partial<AppSettings>) => void;
}) => {
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);

    useEffect(() => {
        apiClient.getModels(serverUrl)
            .then((modelsList) => setOllamaModels(modelsList.filter((m) => m.provider === 'ollama').map((m) => m.id)))
            .catch(() => setOllamaModels([]));
    }, [serverUrl]);

    return (
        <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Cpu size={12} />Ollama 本地模型
            </h2>
            <label className="text-xs text-gray-600">Ollama 地址</label>
            <input
                value={ollamaBaseUrl || ''}
                onChange={(e) => onSettingsChange({ ollamaBaseUrl: e.target.value })}
                className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <div className="mt-2">
                <label className="text-xs text-gray-600">本地模型</label>
                <input
                    value={ollamaModel || ''}
                    onChange={(e) => onSettingsChange({ models: { ...models, ollama: e.target.value } })}
                    placeholder="输入模型名称，如 qwen2.5:32b"
                    className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
            </div>
        </section>
    );
});

const DepthSection = memo(({ reviewDepth, onChange }: { reviewDepth: ReviewDepth; onChange: (d: ReviewDepth) => void }) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">审查深度</h2>
        <div className="space-y-1.5">
            {DEPTH_OPTIONS.map((d) => (
                <label
                    key={d.id}
                    className={clsx(
                        'flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors',
                        reviewDepth === d.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                >
                    <input
                        type="radio"
                        checked={reviewDepth === d.id}
                        onChange={() => onChange(d.id)}
                        className="mt-0.5 accent-primary-600"
                    />
                    <div>
                        <p className="text-xs font-medium text-gray-800">{d.label}</p>
                        <p className="text-xs text-gray-400">{d.description}</p>
                    </div>
                </label>
            ))}
        </div>
    </section>
));

const StandpointSection = memo(({ standpoint, onChange }: { standpoint: 'neutral' | 'party_a' | 'party_b'; onChange: (s: 'neutral' | 'party_a' | 'party_b') => void }) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">审查立场</h2>
        <div className="space-y-1.5">
            {STANDPOINT_OPTIONS.map((sp) => (
                <label
                    key={sp.id}
                    className={clsx(
                        'flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors',
                        standpoint === sp.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                >
                    <input
                        type="radio"
                        checked={standpoint === sp.id}
                        onChange={() => onChange(sp.id)}
                        className="mt-0.5 accent-primary-600"
                    />
                    <div>
                        <p className="text-xs font-medium text-gray-800">{sp.label}</p>
                        <p className="text-xs text-gray-400">{sp.description}</p>
                    </div>
                </label>
            ))}
        </div>
    </section>
));

const ServerSection = memo(({ serverUrl, onChange }: { serverUrl: string; onChange: (val: string) => void }) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Server size={12} />后端服务
        </h2>
        <label className="text-xs text-gray-600">服务地址</label>
        <input
            value={serverUrl || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
    </section>
));

const TemplateSection = memo(({
    reviewTemplates, globalInstruction, addTemplate,
    updateTemplate, removeTemplate, resetBuiltinTemplate,
    onGlobalInstructionChange
}: {
    reviewTemplates: ReviewTemplate[];
    globalInstruction: string;
    addTemplate: (name: string, prompt: string, boundType?: ContractType) => void;
    updateTemplate: (id: string, patch: Partial<ReviewTemplate>) => void;
    removeTemplate: (id: string) => void;
    resetBuiltinTemplate: (id: string) => void;
    onGlobalInstructionChange: (val: string) => void;
}) => {
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formPrompt, setFormPrompt] = useState('');
    const [formBoundType, setFormBoundType] = useState<ContractType | 'none'>('none');

    return (
        <section>
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <BookText size={12} />审查模板配置
                </h2>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm mb-4">
                <p className="text-[10px] text-gray-400 mb-2 mt-1 italic">
                    💡 提示：全局指令将始终追加到任何审查提示词中。<br />
                    绑定了合同类型的模板会在“智能分类”时自动启用。<br />
                    未绑定的自定义模板可在审查面板手动选择。
                </p>

                <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">全局提示词</label>
                    <textarea
                        value={globalInstruction || ''}
                        onChange={(e) => onGlobalInstructionChange(e.target.value)}
                        placeholder="例如：请始终以简体中文输出，格式严谨..."
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-primary-400"
                        rows={3}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between mb-2 mt-4">
                <h3 className="text-xs font-semibold text-gray-700">模板列表</h3>
                {!isCreatingTemplate && (
                    <button
                        type="button"
                        onClick={() => {
                            setIsCreatingTemplate(true);
                            setEditingTemplateId(null);
                            setFormName('');
                            setFormPrompt('');
                            setFormBoundType('none');
                        }}
                        className="text-[10px] bg-primary-50 text-primary-600 px-2 py-1 rounded hover:bg-primary-100 flex items-center gap-1 font-medium shadow-sm"
                    >
                        <Plus size={10} /> 新建
                    </button>
                )}
            </div>

            <div className="space-y-2">
                {isCreatingTemplate && (
                    <div className="border-2 border-primary-400 rounded-lg p-3 bg-primary-50/20 text-xs shadow-sm">
                        <input
                            type="text"
                            placeholder="名称"
                            value={formName}
                            onChange={e => setFormName(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 mb-2 focus:ring-2 focus:ring-primary-400"
                        />
                        <select
                            value={formBoundType}
                            onChange={e => setFormBoundType(e.target.value as any)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 mb-2 focus:ring-2 focus:ring-primary-400"
                        >
                            <option value="none">-- 不绑定 --</option>
                            {CONTRACT_TYPE_OPTIONS.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                        </select>
                        <textarea
                            placeholder="提示词内容..."
                            value={formPrompt}
                            onChange={e => setFormPrompt(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 min-h-[120px] resize-y focus:ring-2 focus:ring-primary-400 font-mono"
                        />
                        <div className="flex justify-end gap-2 mt-3">
                            <button onClick={() => setIsCreatingTemplate(false)} className="btn-secondary text-xs px-2 py-1">取消</button>
                            <button
                                disabled={!formName.trim() || !formPrompt.trim()}
                                onClick={() => {
                                    addTemplate(formName.trim(), formPrompt.trim(), formBoundType === 'none' ? undefined : formBoundType);
                                    setIsCreatingTemplate(false);
                                }}
                                className="btn-primary text-xs px-2 py-1"
                            >保存</button>
                        </div>
                    </div>
                )}

                {reviewTemplates && reviewTemplates.map((template: any) => {
                    const isEditing = editingTemplateId === template.id;
                    if (isEditing) {
                        return (
                            <div key={template.id} className="border-2 border-primary-400 rounded-lg p-3 bg-primary-50/20 text-xs">
                                <input
                                    type="text"
                                    value={formName}
                                    disabled={template.isBuiltin}
                                    onChange={e => setFormName(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 mb-2 disabled:bg-gray-100"
                                />
                                <textarea
                                    value={formPrompt}
                                    onChange={e => setFormPrompt(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 min-h-[120px] font-mono"
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => setEditingTemplateId(null)} className="btn-secondary text-xs px-2 py-1">取消</button>
                                    <button
                                        onClick={() => {
                                            updateTemplate(template.id, { name: formName, prompt: formPrompt });
                                            setEditingTemplateId(null);
                                        }}
                                        className="btn-primary text-xs px-2 py-1"
                                    >更新</button>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={template.id} className="border border-gray-200 rounded-lg p-2.5 bg-white group hover:border-primary-300">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-800">{template.name}</span>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => {
                                        setEditingTemplateId(template.id);
                                        setFormName(template.name);
                                        setFormPrompt(template.prompt);
                                    }} className="text-gray-400 hover:text-blue-600"><Edit2 size={12} /></button>
                                    {!template.isBuiltin && <button onClick={() => removeTemplate(template.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>}
                                </div>
                            </div>
                            <pre className="text-[10px] text-gray-500 mt-1 max-h-[40px] overflow-hidden truncate font-mono bg-gray-50 p-1.5 rounded">{template.prompt}</pre>
                        </div>
                    );
                })}
            </div>
        </section>
    );
});

// ── MCP 服务器管理子组件 ────────────────────────────────────────────
const McpSection = memo(({ serverUrl }: { serverUrl: string }) => {
    const [servers, setServers] = useState<McpServerStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState('');
    const [formId, setFormId] = useState('');
    const [formName, setFormName] = useState('');
    const [formTransport, setFormTransport] = useState<'stdio' | 'sse'>('stdio');
    const [formCommand, setFormCommand] = useState('');
    const [formArgs, setFormArgs] = useState('');
    const [formUrl, setFormUrl] = useState('');

    const fetchServers = useCallback(async () => {
        setLoading(true);
        try {
            const list = await apiClient.getMcpServers(serverUrl);
            setServers(list);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : '无法连接服务');
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => { fetchServers(); }, [fetchServers]);

    const handleAdd = async () => {
        if (!formId.trim() || !formName.trim()) return;
        const config: McpServerConfig = {
            id: formId.trim(), name: formName.trim(), transport: formTransport, enabled: true,
        };
        if (formTransport === 'stdio') {
            config.command = formCommand.trim();
            config.args = formArgs.trim() ? formArgs.trim().split(/\s+/) : [];
        } else {
            config.url = formUrl.trim();
        }
        try {
            await apiClient.addMcpServer(config, serverUrl);
            setIsAdding(false);
            setFormId(''); setFormName(''); setFormCommand(''); setFormArgs(''); setFormUrl('');
            await fetchServers();
        } catch (err) {
            setError(err instanceof Error ? err.message : '添加失败');
        }
    };

    const handleRemove = async (id: string) => {
        try { await apiClient.removeMcpServer(id, serverUrl); await fetchServers(); }
        catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
    };

    const handleReconnect = async (id: string) => {
        try { await apiClient.reconnectMcpServer(id, serverUrl); await fetchServers(); }
        catch (err) { setError(err instanceof Error ? err.message : '重连失败'); }
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Wrench size={12} />MCP 工具扩展
                </h2>
                <div className="flex gap-1.5">
                    <button onClick={fetchServers} className="text-gray-400 hover:text-primary-600 p-0.5" title="刷新">
                        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                    </button>
                    {!isAdding && (
                        <button onClick={() => setIsAdding(true)}
                            className="text-[10px] bg-primary-50 text-primary-600 px-2 py-1 rounded hover:bg-primary-100 flex items-center gap-1 font-medium shadow-sm transition-all">
                            <Plus size={10} /> 添加
                        </button>
                    )}
                </div>
            </div>

            {error && <p className="text-[10px] text-red-500 mb-2 bg-red-50 px-2 py-1 rounded">{error}</p>}

            {isAdding && (
                <div className="border-2 border-primary-400 rounded-lg p-3 bg-primary-50/20 text-xs shadow-sm mb-2">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">ID（唯一标识）</label>
                            <input type="text" value={formId} onChange={e => setFormId(e.target.value)}
                                placeholder="legal-db"
                                className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">显示名称</label>
                            <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                                placeholder="法律数据库"
                                className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                        </div>
                    </div>

                    <label className="block text-[10px] text-gray-500 mb-0.5">传输方式</label>
                    <select value={formTransport} onChange={e => setFormTransport(e.target.value as 'stdio' | 'sse')}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
                        <option value="stdio">stdio（本地进程）</option>
                        <option value="sse">SSE（远程 HTTP）</option>
                    </select>

                    {formTransport === 'stdio' ? (
                        <>
                            <label className="block text-[10px] text-gray-500 mb-0.5">启动命令</label>
                            <input type="text" value={formCommand} onChange={e => setFormCommand(e.target.value)}
                                placeholder="python -m legal_db_server"
                                className="w-full border border-gray-300 rounded px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                            <label className="block text-[10px] text-gray-500 mb-0.5">参数（空格分隔）</label>
                            <input type="text" value={formArgs} onChange={e => setFormArgs(e.target.value)}
                                placeholder="--port 8080"
                                className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                        </>
                    ) : (
                        <>
                            <label className="block text-[10px] text-gray-500 mb-0.5">服务器 URL</label>
                            <input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)}
                                placeholder="http://localhost:8080/sse"
                                className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                        </>
                    )}

                    <div className="flex justify-end gap-2 mt-3">
                        <button onClick={() => setIsAdding(false)} className="btn-secondary text-xs px-3 py-1.5">取消</button>
                        <button disabled={!formId.trim() || !formName.trim()} onClick={handleAdd}
                            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50">
                            <Check size={12} /> 添加
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-1.5">
                {servers.length === 0 && !loading && (
                    <p className="text-[10px] text-gray-400 italic py-2 text-center">暂无 MCP 服务器。添加后可扩展 AI 的工具调用能力。</p>
                )}
                {servers.map(s => (
                    <div key={s.id} className="border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-primary-300 transition-all group flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={clsx('w-2 h-2 rounded-full shrink-0', s.connected ? 'bg-emerald-500' : 'bg-gray-300')}
                                title={s.connected ? '已连接' : '未连接'} />
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-800 truncate">{s.name}</p>
                                <p className="text-[10px] text-gray-400">
                                    {s.transport} · {s.connected
                                        ? <span className="text-emerald-600">{s.toolCount} 个工具可用</span>
                                        : <span className="text-gray-400">未连接</span>}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => handleReconnect(s.id)} title="重新连接"
                                className="text-gray-400 hover:text-primary-600 p-1 rounded hover:bg-primary-50 transition-colors">
                                <Plug size={12} />
                            </button>
                            <button onClick={() => handleRemove(s.id)} title="删除"
                                className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
});

