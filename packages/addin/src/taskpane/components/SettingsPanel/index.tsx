import React, { useState, useEffect, useCallback, memo } from 'react';
import { Save, RefreshCw, Eye, EyeOff, Server, Cpu, KeyRound, BookText, Plus, Edit2, Trash2, Check, X, Plug, Unplug, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { useSettingsStore } from '../../../store/settingsStore';
import type { ProviderType, ReviewDepth, ReviewTemplate } from '../../../types/settings';
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

/**
 * 防抖输入框组件：解决 WPS Mac 粘贴长文本触发高频更新导致的界面卡死。
 * 使用局部 state 承接输入，仅在停顿或失去焦点时同步到全局 Store/LocalStorage。
 */
const DebouncedInput = memo(({
    value,
    onChange,
    placeholder,
    type = 'text',
    className,
    list
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
    list?: string;
}) => {
    const [localValue, setLocalValue] = useState(value || '');

    // 当外部真正更新（如重置/初始化）时同步局部值
    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localValue !== value) {
                onChange(localValue);
            }
        }, 800); // 增加到 800ms，确保粘贴动作完全通过
        return () => clearTimeout(timer);
    }, [localValue, onChange, value]);

    return (
        <input
            type={type}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
                if (localValue !== value) onChange(localValue);
            }}
            placeholder={placeholder}
            className={className}
            list={list}
        />
    );
});

/**
 * 防抖文本域组件：同 DebouncedInput，用于长文本提示词。
 */
const DebouncedTextArea = memo(({
    value,
    onChange,
    placeholder,
    className,
    rows = 3
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
    rows?: number;
}) => {
    const [localValue, setLocalValue] = useState(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localValue !== value) {
                onChange(localValue);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [localValue, onChange, value]);

    return (
        <textarea
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
                if (localValue !== value) onChange(localValue);
            }}
            placeholder={placeholder}
            className={className}
            rows={rows}
        />
    );
});

export default function SettingsPanel() {
    const {
        settings, updateSettings, updateApiKey, addTemplate,
        updateTemplate, removeTemplate, resetBuiltinTemplate,
        updateGlobalInstruction, resetToDefaults
    } = useSettingsStore();

    const [saved, setSaved] = useState(false);
    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="p-3 space-y-4">
                {/* 拆分为子组件以利用组件化渲染隔离性能 */}
                <ProviderSection provider={settings.provider} updateSettings={updateSettings} />

                {settings.provider !== 'ollama' && (
                    <ApiKeySection
                        provider={settings.provider}
                        apiKeys={settings.apiKeys}
                        models={settings.models}
                        updateApiKey={updateApiKey}
                        updateSettings={updateSettings}
                        rememberApiKeys={settings.rememberApiKeys}
                        baseUrl={settings.baseUrl}
                    />
                )}

                {settings.provider === 'ollama' && (
                    <OllamaSection
                        ollamaBaseUrl={settings.ollamaBaseUrl}
                        ollamaModel={settings.models.ollama}
                        models={settings.models}
                        serverUrl={settings.serverUrl}
                        updateSettings={updateSettings}
                    />
                )}

                <DepthSection reviewDepth={settings.reviewDepth} updateSettings={updateSettings} />

                <StandpointSection standpoint={settings.standpoint} updateSettings={updateSettings} />

                <TemplateSection
                    reviewTemplates={settings.reviewTemplates}
                    globalInstruction={settings.globalInstruction}
                    addTemplate={addTemplate}
                    updateTemplate={updateTemplate}
                    removeTemplate={removeTemplate}
                    resetBuiltinTemplate={resetBuiltinTemplate}
                    updateGlobalInstruction={updateGlobalInstruction}
                />

                <McpSection serverUrl={settings.serverUrl} />

                <ServerSection serverUrl={settings.serverUrl} updateSettings={updateSettings} />

                <div className="flex gap-2 pt-2 pb-4">
                    <button onClick={handleSave} className={clsx('btn-primary flex-1 text-sm flex items-center justify-center gap-1.5', saved && 'bg-emerald-600 hover:bg-emerald-700')}>
                        <Save size={13} />
                        {saved ? '已保存 ✓' : '保存设置'}
                    </button>
                    <button onClick={resetToDefaults} className="btn-secondary text-sm flex items-center gap-1.5">
                        <RefreshCw size={13} />
                        重置
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── 子组件拆分 (针对 WPS Mac 渲染性能瓶颈进行隔离) ──────────────────────────

const ProviderSection = memo(({ provider, updateSettings }: any) => (
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
                        onChange={() => updateSettings({ provider: p.id })}
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

const ApiKeySection = memo(({ provider, apiKeys, models, updateApiKey, updateSettings, rememberApiKeys, baseUrl }: any) => {
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
                                <DebouncedInput
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKeys.anthropic}
                                    onChange={(val) => updateApiKey('anthropic', val)}
                                    placeholder="sk-ant-..."
                                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-400"
                                />
                                <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>
                            <div className="mt-2">
                                <label className="text-xs text-gray-600">模型</label>
                                <DebouncedInput
                                    value={models.claude}
                                    onChange={(val) => updateSettings({ models: { ...models, claude: val } })}
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
                                <DebouncedInput
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKeys.openai}
                                    onChange={(val) => updateApiKey('openai', val)}
                                    placeholder="sk-..."
                                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-400"
                                />
                                <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>
                            <label className="text-xs text-gray-600 mt-2 block">API Base URL（兼容接口）</label>
                            <DebouncedInput
                                value={baseUrl || ''}
                                onChange={(val) => updateSettings({ baseUrl: val })}
                                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                            />
                            <div className="mt-2">
                                <label className="text-xs text-gray-600">模型</label>
                                <DebouncedInput
                                    value={models.openai}
                                    onChange={(val) => updateSettings({ models: { ...models, openai: val } })}
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
                    checked={rememberApiKeys}
                    onChange={(e) => updateSettings({ rememberApiKeys: e.target.checked })}
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

const OllamaSection = memo(({ ollamaBaseUrl, ollamaModel, models, serverUrl, updateSettings }: any) => {
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
            <DebouncedInput
                value={ollamaBaseUrl}
                onChange={(val) => updateSettings({ ollamaBaseUrl: val })}
                className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <div className="mt-2">
                <label className="text-xs text-gray-600">本地模型</label>
                <DebouncedInput
                    value={ollamaModel}
                    onChange={(val) => updateSettings({ models: { ...models, ollama: val } })}
                    placeholder="输入模型名称，如 qwen2.5:32b"
                    className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
            </div>
        </section>
    );
});

const DepthSection = memo(({ reviewDepth, updateSettings }: any) => (
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
                        onChange={() => updateSettings({ reviewDepth: d.id })}
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

const StandpointSection = memo(({ standpoint, updateSettings }: any) => (
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
                        onChange={() => updateSettings({ standpoint: sp.id })}
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

const ServerSection = memo(({ serverUrl, updateSettings }: any) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Server size={12} />后端服务
        </h2>
        <label className="text-xs text-gray-600">服务地址</label>
        <DebouncedInput
            value={serverUrl}
            onChange={(val) => updateSettings({ serverUrl: val })}
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
    </section>
));

const TemplateSection = memo(({
    reviewTemplates, globalInstruction, addTemplate,
    updateTemplate, removeTemplate, resetBuiltinTemplate,
    updateGlobalInstruction
}: any) => {
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
                    <DebouncedTextArea
                        value={globalInstruction || ''}
                        onChange={(val) => updateGlobalInstruction(val)}
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

