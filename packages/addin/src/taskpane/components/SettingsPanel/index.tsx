import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Save, RefreshCw, Eye, EyeOff, Server, Cpu, KeyRound, BookText, Plus, Edit2, Trash2, Check, X, Plug, Unplug, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { useSettingsStore } from '../../../store/settingsStore';
import type { AppSettings, ProviderType, ReviewDepth, ReviewTemplate } from '../../../types/settings';
import { apiClient } from '../../../services/apiClient';
import type { McpServerStatus, McpServerConfig } from '../../../services/apiClient';
import { CONTRACT_TYPE_OPTIONS } from '../../../constants/defaultTemplates';
import { LEGAL_DOCUMENT_TYPE_OPTIONS, LEGAL_DOCUMENT_TYPE_LABELS } from '../../../constants/legalWriting';
import type { LegalDocumentType } from '../../../types/legalDocument';

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
    { id: 'party_a', label: '委托方视角', description: '聚焦委托方权益保护，重点识别对委托方不利的表述' },
    { id: 'party_b', label: '相对方视角', description: '从相对方角度审视文本强弱，发现可能引发反驳的位置' },
];

export default function SettingsPanel() {
    const {
        settings, updateSettings, addTemplate,
        updateTemplate, removeTemplate, resetBuiltinTemplate,
        resetToDefaults
    } = useSettingsStore();

    // 🏆 V3 核心改进：非受控架构。使用 Refs 采集数据，粘贴时 JS 零负载
    const anthropicKeyRef = useRef<HTMLInputElement>(null);
    const openaiKeyRef = useRef<HTMLInputElement>(null);
    const claudeModelRef = useRef<HTMLInputElement>(null);
    const openaiModelRef = useRef<HTMLInputElement>(null);
    const ollamaModelRef = useRef<HTMLInputElement>(null);
    const baseUrlRef = useRef<HTMLInputElement>(null);
    const ollamaBaseUrlRef = useRef<HTMLInputElement>(null);
    const serverUrlRef = useRef<HTMLInputElement>(null);
    const globalInstructionRef = useRef<HTMLTextAreaElement>(null);
    const rememberRef = useRef<HTMLInputElement>(null);

    // 必须保留的受控状态（逻辑切换类）
    const [currentProvider, setCurrentProvider] = useState<ProviderType>(settings.provider);
    const [currentDepth, setCurrentDepth] = useState<ReviewDepth>(settings.reviewDepth);
    const [currentStandpoint, setCurrentStandpoint] = useState<'neutral' | 'party_a' | 'party_b'>(settings.standpoint);
    const [currentDocumentType, setCurrentDocumentType] = useState<LegalDocumentType>(settings.documentType);
    const [saved, setSaved] = useState(false);

    // 当全局设置重置时，强制同步一次（非受控组件也需要 key 来触发重新挂载以应用新 defaultValue）
    const [resetKey, setResetKey] = useState(0);
    useEffect(() => {
        setCurrentProvider(settings.provider);
        setCurrentDepth(settings.reviewDepth);
        setCurrentStandpoint(settings.standpoint);
        setCurrentDocumentType(settings.documentType);
        setResetKey(prev => prev + 1);
    }, [settings]);

    const handleSave = () => {
        const newSettings: Partial<AppSettings> = {
            documentType: currentDocumentType,
            provider: currentProvider,
            reviewDepth: currentDepth,
            standpoint: currentStandpoint,
            baseUrl: baseUrlRef.current?.value || '',
            ollamaBaseUrl: ollamaBaseUrlRef.current?.value || '',
            serverUrl: serverUrlRef.current?.value || '',
            globalInstruction: globalInstructionRef.current?.value || '',
            rememberApiKeys: rememberRef.current?.checked || false,
            apiKeys: {
                anthropic: anthropicKeyRef.current?.value || '',
                openai: openaiKeyRef.current?.value || ''
            },
            models: {
                claude: claudeModelRef.current?.value || '',
                openai: openaiModelRef.current?.value || '',
                ollama: ollamaModelRef.current?.value || ''
            }
        };

        updateSettings(newSettings as Partial<AppSettings>);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto" key={resetKey}>
            <div className="p-3 space-y-4 pb-20">
                <ProviderSection
                    provider={currentProvider}
                    onChange={setCurrentProvider}
                />

                <DocumentTypeSection
                    documentType={currentDocumentType}
                    onChange={setCurrentDocumentType}
                />

                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">配置详情</h2>

                    {currentProvider === 'claude' && (
                        <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-600 font-medium">Anthropic API Key</label>
                                <InputControl
                                    inputRef={anthropicKeyRef}
                                    defaultValue={settings.apiKeys.anthropic}
                                    isPassword
                                    placeholder="sk-ant-..."
                                />
                                <div className="mt-2 text-xs text-gray-600 font-medium">模型</div>
                                <input
                                    ref={claudeModelRef}
                                    defaultValue={settings.models.claude}
                                    placeholder="例如：claude-3-7-sonnet-20250219"
                                    list="claude-models-list"
                                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                />
                                <datalist id="claude-models-list">
                                    {CLAUDE_MODELS.map((m) => <option key={m} value={m} />)}
                                </datalist>
                            </div>
                        </div>
                    )}

                    {currentProvider === 'openai' && (
                        <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-600 font-medium">OpenAI API Key</label>
                                <InputControl
                                    inputRef={openaiKeyRef}
                                    defaultValue={settings.apiKeys.openai}
                                    isPassword
                                    placeholder="sk-..."
                                />
                                <label className="text-xs text-gray-600 mt-2 block font-medium">API Base URL</label>
                                <input
                                    ref={baseUrlRef}
                                    defaultValue={settings.baseUrl}
                                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                />
                                <div className="mt-2 text-xs text-gray-600 font-medium">模型</div>
                                <input
                                    ref={openaiModelRef}
                                    defaultValue={settings.models.openai}
                                    placeholder="例如：gpt-4o 或 deepseek-chat"
                                    list="openai-models-list"
                                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                />
                                <datalist id="openai-models-list">
                                    {OPENAI_MODELS.map((m) => <option key={m} value={m} />)}
                                </datalist>
                            </div>
                        </div>
                    )}

                    {currentProvider === 'ollama' && (
                        <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                            <label className="text-xs text-gray-600 font-medium">Ollama 地址</label>
                            <input
                                ref={ollamaBaseUrlRef}
                                defaultValue={settings.ollamaBaseUrl}
                                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-400 focus:outline-none"
                            />
                            <div className="mt-2 text-xs text-gray-600 font-medium">本地模型</div>
                            <input
                                ref={ollamaModelRef}
                                defaultValue={settings.models.ollama}
                                placeholder="输入模型名称，如 qwen2.5:32b"
                                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-400 focus:outline-none"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2.5 px-1 py-1">
                        <input
                            type="checkbox"
                            id="remember-api-key"
                            ref={rememberRef}
                            defaultChecked={settings.rememberApiKeys}
                            className="accent-primary-600 w-3.5 h-3.5 cursor-pointer"
                        />
                        <label htmlFor="remember-api-key" className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
                            <KeyRound size={11} className="text-gray-400" />
                            记住密钥（存储在本机，关闭则刷新后清空）
                        </label>
                    </div>
                </section>

                <DepthSection reviewDepth={currentDepth} onChange={setCurrentDepth} />
                <StandpointSection standpoint={currentStandpoint} onChange={setCurrentStandpoint} />

                <section>
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                            <BookText size={12} />审校模板配置
                        </h2>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm mb-4">
                        <label className="text-xs font-semibold text-gray-700 block mb-1">全局提示词</label>
                        <textarea
                            ref={globalInstructionRef}
                            defaultValue={settings.globalInstruction}
                            placeholder="请始终以简体中文输出..."
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 min-h-[80px] focus:ring-2 focus:ring-primary-400 focus:outline-none"
                        />
                    </div>
                    <TemplateSection
                        reviewTemplates={settings.reviewTemplates}
                        addTemplate={addTemplate}
                        updateTemplate={updateTemplate}
                        removeTemplate={removeTemplate}
                        resetBuiltinTemplate={resetBuiltinTemplate}
                        defaultDocumentType={currentDocumentType}
                    />
                </section>

                <McpSection serverUrl={settings.serverUrl} />

                <section>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Server size={12} />后端服务
                    </h2>
                    <input
                        ref={serverUrlRef}
                        defaultValue={settings.serverUrl}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-400 focus:outline-none"
                    />
                </section>

                <div className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t pt-3 pb-4 px-1 flex gap-2 z-50">
                    <button
                        onClick={handleSave}
                        className={clsx(
                            'btn-primary flex-1 text-sm font-semibold py-2.5 flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95',
                            saved ? 'bg-emerald-600' : 'bg-primary-600'
                        )}
                    >
                        <Save size={14} />
                        {saved ? '已保存 ✓' : '保存设置'}
                    </button>
                    <button onClick={resetToDefaults} className="btn-secondary text-sm px-4 flex items-center gap-1.5 bg-gray-50 text-gray-600 border-gray-200">
                        <RefreshCw size={13} />
                        重置
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── 性能优先的原生输入控制封装 ──────────────────────────────────────────

const InputControl = memo(({ inputRef, defaultValue, isPassword, placeholder }: any) => {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                ref={inputRef}
                type={isPassword && !show ? 'password' : 'text'}
                defaultValue={defaultValue || ''}
                placeholder={placeholder}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {isPassword && (
                <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    {show ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
            )}
        </div>
    );
});

// ── 其他 Section 子组件保持轻量逻辑 ──────────────────────────────────────

const ProviderSection = memo(({ provider, onChange }: any) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI 提供商</h2>
        <div className="space-y-1.5 text-xs">
            {PROVIDERS.map((p) => (
                <label key={p.id} className={clsx(
                    'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all',
                    provider === p.id ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400' : 'border-gray-200 bg-white hover:border-gray-300'
                )}>
                    <input type="radio" checked={provider === p.id} onChange={() => onChange(p.id)} className="mt-0.5" />
                    <div>
                        <p className="font-semibold text-gray-800">{p.label}</p>
                        <p className="text-gray-400 leading-tight">{p.description}</p>
                    </div>
                </label>
            ))}
        </div>
    </section>
));

const DocumentTypeSection = memo(({ documentType, onChange }: { documentType: LegalDocumentType; onChange: (value: LegalDocumentType) => void }) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">默认文书类型</h2>
        <div className="space-y-1.5 text-xs">
            {LEGAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                <label key={option.id} className={clsx(
                    'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all',
                    documentType === option.id ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400' : 'border-gray-200 bg-white hover:border-gray-300'
                )}>
                    <input type="radio" checked={documentType === option.id} onChange={() => onChange(option.id)} className="mt-0.5" />
                    <div>
                        <p className="font-semibold text-gray-800">{option.label}</p>
                        <p className="text-gray-400 leading-tight">{option.description}</p>
                    </div>
                </label>
            ))}
        </div>
    </section>
));

const DepthSection = memo(({ reviewDepth, onChange }: any) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">审校深度</h2>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
            {DEPTH_OPTIONS.map((d) => (
                <button
                    key={d.id}
                    onClick={() => onChange(d.id)}
                    className={clsx(
                        'flex flex-col items-center p-2 rounded-lg border text-center transition-all',
                        reviewDepth === d.id ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400' : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                >
                    <span className="font-bold mb-0.5">{d.label}</span>
                    <span className="text-[10px] text-gray-400 line-clamp-1">{d.description}</span>
                </button>
            ))}
        </div>
    </section>
));

const StandpointSection = memo(({ standpoint, onChange }: any) => (
    <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">审校立场</h2>
        <div className="flex gap-2 text-[11px]">
            {STANDPOINT_OPTIONS.map((sp) => (
                <button
                    key={sp.id}
                    onClick={() => onChange(sp.id)}
                    className={clsx(
                        'flex-1 py-1.5 px-2 rounded-lg border transition-all',
                        standpoint === sp.id ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400 font-bold text-primary-700' : 'border-gray-200 bg-white text-gray-600'
                    )}
                >
                    {sp.label}
                </button>
            ))}
        </div>
    </section>
));

const TemplateSection = memo(({ reviewTemplates, addTemplate, updateTemplate, removeTemplate, resetBuiltinTemplate, defaultDocumentType }: any) => {
    const [isCreating, setIsCreating] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const formNameRef = useRef<HTMLInputElement>(null);
    const formPromptRef = useRef<HTMLTextAreaElement>(null);
    const [formDocumentType, setFormDocumentType] = useState<LegalDocumentType>(defaultDocumentType || 'contract');
    const [formBoundType, setFormBoundType] = useState<string | 'none'>('none');

    useEffect(() => {
        setFormDocumentType(defaultDocumentType || 'contract');
    }, [defaultDocumentType]);

    const handleConfirmAdd = () => {
        const name = formNameRef.current?.value.trim();
        const prompt = formPromptRef.current?.value.trim();
        if (name && prompt) {
            addTemplate(
                name,
                prompt,
                formDocumentType,
                formDocumentType === 'contract' && formBoundType !== 'none' ? formBoundType : undefined
            );
            setIsCreating(false);
            setFormDocumentType(defaultDocumentType || 'contract');
            setFormBoundType('none');
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-end">
                {!isCreating && (
                    <button onClick={() => setIsCreating(true)} className="text-[10px] text-primary-600 bg-primary-50 px-2 py-1 rounded-md font-bold">+ 新建模板</button>
                )}
            </div>
            {isCreating && (
                <div className="p-3 border-2 border-primary-200 rounded-lg bg-primary-50/10 space-y-2 shadow-inner">
                    <input ref={formNameRef} placeholder="名称" className="w-full text-xs border rounded p-1.5" />
                    <select value={formDocumentType} onChange={e => setFormDocumentType(e.target.value as LegalDocumentType)} className="w-full text-xs border rounded p-1.5">
                        {LEGAL_DOCUMENT_TYPE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                    </select>
                    {formDocumentType === 'contract' && (
                        <select value={formBoundType} onChange={e => setFormBoundType(e.target.value)} className="w-full text-xs border rounded p-1.5">
                            <option value="none">-- 不绑定合同子类型 --</option>
                            {CONTRACT_TYPE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    )}
                    <textarea ref={formPromptRef} placeholder="提示词内容..." className="w-full text-xs border rounded p-1.5 min-h-[100px]" />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsCreating(false)} className="text-xs text-gray-400">取消</button>
                        <button onClick={handleConfirmAdd} className="btn-primary text-xs px-3 py-1">创建</button>
                    </div>
                </div>
            )}
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                {reviewTemplates?.map((t: any) => (
                    <div key={t.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50 group hover:border-primary-200 transition-colors shadow-sm">
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-gray-700 truncate">{t.name}</span>
                                <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-1.5 py-0.5">
                                    {LEGAL_DOCUMENT_TYPE_LABELS[(t.documentType || 'contract') as LegalDocumentType]}
                                </span>
                            </div>
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditId(t.id); }} className="text-gray-400 hover:text-blue-500"><Edit2 size={11} /></button>
                                {!t.isBuiltin && <button onClick={() => removeTemplate(t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>}
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate line-clamp-1 italic">{t.prompt}</p>
                    </div>
                ))}
            </div>
        </div>
    );
});

// McpSection 略 (逻辑保持现状即可，其不属于大文本高频输入区)
const McpSection = memo(({ serverUrl }: { serverUrl: string }) => {
    const [servers, setServers] = useState<McpServerStatus[]>([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        apiClient.getMcpServers(serverUrl).then(setServers).catch(() => { });
    }, [serverUrl]);

    return (
        <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Wrench size={12} />工具扩展 (MCP)
            </h2>
            <div className="space-y-1.5">
                {servers.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 text-[10px]">
                        <div className="flex items-center gap-2">
                            <div className={clsx('w-1.5 h-1.5 rounded-full', s.connected ? 'bg-green-500' : 'bg-gray-300')} />
                            <span className="font-medium text-gray-700">{s.name}</span>
                        </div>
                        <span className="text-gray-400">{s.toolCount || 0} tools</span>
                    </div>
                ))}
                <p className="text-[9px] text-gray-400 text-center italic">MCP 配置请通过 Server 接口调整后刷新</p>
            </div>
        </section>
    );
});
