import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    Search,
    CheckCircle,
    Circle,
    Clock,
    Copy,
    Download,
    FileText,
    FolderTree,
    Loader2,
    Scale,
} from 'lucide-react';
import clsx from 'clsx';
import { usePlatform } from '../../../platform/platformContext';
import { useSettingsStore } from '../../../store/settingsStore';
import { apiClient } from '../../../services/apiClient';
import type {
    ElementPleadingApiResponse,
    ElementPleadingTemplateCategory,
    ElementPleadingTemplateSummary,
} from '../../../types/elementPleading';

type GenerationStage = 'idle' | 'catalog' | 'reading' | 'submitting' | 'waiting' | 'opening' | 'success';
type CopyStatus = 'idle' | 'success' | 'error';
type GeneratedResult = Pick<ElementPleadingApiResponse, 'base64Docx' | 'fileName'>;

function formatElapsed(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function waitForNextPaint(): Promise<void> {
    if (typeof window === 'undefined') {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => resolve());
            return;
        }
        window.setTimeout(resolve, 0);
    });
}

function isStageDone(current: GenerationStage, step: GenerationStage): boolean {
    const order: GenerationStage[] = ['idle', 'catalog', 'reading', 'submitting', 'waiting', 'opening', 'success'];
    return order.indexOf(current) > order.indexOf(step);
}

async function copyText(text: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
        throw new Error('当前宿主不支持复制到剪贴板。');
    }
    await navigator.clipboard.writeText(text);
}

function findFirstTemplate(categories: ElementPleadingTemplateCategory[]): ElementPleadingTemplateSummary | null {
    for (const category of categories) {
        if (category.items.length > 0) {
            return category.items[0] ?? null;
        }
    }
    return null;
}

export default function ElementPleadingPanel() {
    const platform = usePlatform();
    const { settings } = useSettingsStore();

    const [catalog, setCatalog] = useState<ElementPleadingTemplateCategory[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [templateSearch, setTemplateSearch] = useState('');

    const [loading, setLoading] = useState(false);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [generationStage, setGenerationStage] = useState<GenerationStage>('catalog');
    const [waitingSeconds, setWaitingSeconds] = useState(0);
    const [lastGeneratedResult, setLastGeneratedResult] = useState<GeneratedResult | null>(null);
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

    const waitingStartedAtRef = useRef<number | null>(null);
    const waitingTimerRef = useRef<number | null>(null);
    const copyStatusTimerRef = useRef<number | null>(null);
    const isMacWps = platform.platform === 'wps'
        && typeof navigator !== 'undefined'
        && /Macintosh|Mac OS X/i.test(navigator.userAgent);

    const selectedCategory = useMemo(
        () => catalog.find((category) => category.id === selectedCategoryId) ?? catalog[0] ?? null,
        [catalog, selectedCategoryId],
    );

    const filteredTemplates = useMemo(() => {
        const items = selectedCategory?.items ?? [];
        const keyword = templateSearch.trim().toLowerCase();
        if (!keyword) {
            return items;
        }
        return items.filter((item) => {
            const haystacks = [item.label, item.documentTitle, item.caseTitle ?? ''];
            return haystacks.some((value) => value.toLowerCase().includes(keyword));
        });
    }, [selectedCategory, templateSearch]);

    const selectedTemplate = useMemo(
        () => filteredTemplates.find((item) => item.templateId === selectedTemplateId)
            ?? filteredTemplates[0]
            ?? null,
        [filteredTemplates, selectedTemplateId],
    );

    const generationSteps = useMemo<Array<{
        stage: Exclude<GenerationStage, 'idle' | 'success' | 'catalog'>;
        label: string;
        description: string;
    }>>(() => [
        {
            stage: 'reading',
            label: '读取当前文书',
            description: '从当前宿主里读取完整文书内容。',
        },
        {
            stage: 'submitting',
            label: '提交生成请求',
            description: '将文书内容和所选官方模板提交到服务端。',
        },
        {
            stage: 'waiting',
            label: '服务端处理中',
            description: '服务端正在识别主体信息、请求事项和事实要素，并回填到官方模板。',
        },
        {
            stage: 'opening',
            label: '打开生成结果',
            description: platform.platform === 'wps'
                ? 'WPS 优先尝试本地直接打开；若宿主不支持，则自动回退到下载。'
                : 'Word 会直接打开新生成的文书。',
        },
    ], [platform.platform]);

    useEffect(() => () => {
        if (waitingTimerRef.current !== null) {
            window.clearInterval(waitingTimerRef.current);
        }
        if (copyStatusTimerRef.current !== null) {
            window.clearTimeout(copyStatusTimerRef.current);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadCatalog() {
            setCatalogLoading(true);
            setCatalogError(null);
            setGenerationStage('catalog');

            try {
                const categories = await apiClient.getElementPleadingTemplates(settings.serverUrl);
                if (cancelled) {
                    return;
                }

                setCatalog(categories);
                const firstTemplate = findFirstTemplate(categories);
                setSelectedCategoryId(firstTemplate?.categoryId ?? categories[0]?.id ?? '');
                setSelectedTemplateId(firstTemplate?.templateId ?? '');
                setTemplateSearch('');
                setGenerationStage('idle');
            } catch (err) {
                if (cancelled) {
                    return;
                }
                setCatalogError(err instanceof Error ? err.message : '官方模板目录加载失败。');
                setGenerationStage('idle');
            } finally {
                if (!cancelled) {
                    setCatalogLoading(false);
                }
            }
        }

        void loadCatalog();

        return () => {
            cancelled = true;
        };
    }, [settings.serverUrl]);

    useEffect(() => {
        if (!selectedCategory) {
            return;
        }
        const stillExists = filteredTemplates.some((item) => item.templateId === selectedTemplateId);
        if (!stillExists) {
            setSelectedTemplateId(filteredTemplates[0]?.templateId ?? '');
        }
    }, [filteredTemplates, selectedCategory, selectedTemplateId]);

    useEffect(() => {
        if (generationStage !== 'waiting') {
            if (waitingTimerRef.current !== null) {
                window.clearInterval(waitingTimerRef.current);
                waitingTimerRef.current = null;
            }
            return;
        }

        const syncElapsed = () => {
            if (waitingStartedAtRef.current === null) {
                return;
            }
            setWaitingSeconds(Math.max(0, Math.floor((Date.now() - waitingStartedAtRef.current) / 1000)));
        };

        syncElapsed();
        waitingTimerRef.current = window.setInterval(syncElapsed, 1000);

        return () => {
            if (waitingTimerRef.current !== null) {
                window.clearInterval(waitingTimerRef.current);
                waitingTimerRef.current = null;
            }
        };
    }, [generationStage]);

    const resetWaitingTimer = () => {
        waitingStartedAtRef.current = null;
        setWaitingSeconds(0);
        if (waitingTimerRef.current !== null) {
            window.clearInterval(waitingTimerRef.current);
            waitingTimerRef.current = null;
        }
    };

    const scheduleCopyStatusReset = () => {
        if (copyStatusTimerRef.current !== null) {
            window.clearTimeout(copyStatusTimerRef.current);
        }
        copyStatusTimerRef.current = window.setTimeout(() => setCopyStatus('idle'), 2000);
    };

    const handleGenerate = async () => {
        if (loading || !selectedTemplate) {
            return;
        }

        setLoading(true);
        setWarnings([]);
        setError(null);
        setSuccessMessage(null);
        setGenerationStage('reading');
        setLastGeneratedResult(null);
        setCopyStatus('idle');
        resetWaitingTimer();

        try {
            const content = await platform.documentReader.readFullText();
            if (!content || content.trim().length < 20) {
                throw new Error('当前文书内容过短，无法生成要素式文书。');
            }

            setGenerationStage('submitting');
            await waitForNextPaint();
            waitingStartedAtRef.current = Date.now();
            setGenerationStage('waiting');

            const response = await apiClient.generateElementPleadingDocx(
                {
                    content,
                    provider: settings.provider,
                    model: settings.models[settings.provider],
                    templateId: selectedTemplate.templateId,
                    apiKey: settings.provider === 'ollama'
                        ? undefined
                        : settings.apiKeys[settings.provider === 'claude' ? 'anthropic' : 'openai'],
                    baseUrl: settings.provider === 'openai' ? settings.baseUrl : undefined,
                },
                settings.serverUrl,
            );

            setGenerationStage('opening');
            await platform.openGeneratedDocx(response.base64Docx, response.fileName);
            setWarnings(response.warnings);
            setLastGeneratedResult({
                base64Docx: response.base64Docx,
                fileName: response.fileName,
            });

            if (platform.platform === 'wps') {
                setSuccessMessage(`已生成 ${selectedTemplate.label}。WPS 会优先尝试本地直接打开；若宿主不支持，则自动回退到下载。`);
            } else {
                setSuccessMessage(`已生成并打开新的 ${selectedTemplate.label}。`);
            }

            setGenerationStage('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成要素式文书失败。');
            setGenerationStage('idle');
            setWarnings([]);
            setSuccessMessage(null);
            setLastGeneratedResult(null);
        } finally {
            resetWaitingTimer();
            setLoading(false);
        }
    };

    const handleRetryOpen = async () => {
        if (!lastGeneratedResult) {
            return;
        }

        setError(null);
        try {
            await platform.openGeneratedDocx(lastGeneratedResult.base64Docx, lastGeneratedResult.fileName);
            setSuccessMessage('已再次尝试打开生成结果；若宿主不支持本地直接打开，则会自动回退到下载。');
        } catch (err) {
            setError(err instanceof Error ? err.message : '重新打开失败，请稍后重试。');
        }
    };

    const handleCopyFileName = async () => {
        if (!lastGeneratedResult?.fileName) {
            return;
        }

        try {
            await copyText(lastGeneratedResult.fileName);
            setCopyStatus('success');
        } catch {
            setCopyStatus('error');
        } finally {
            scheduleCopyStatusReset();
        }
    };

    const currentStep = generationSteps.find((step) => step.stage === generationStage) ?? null;

    return (
        <div className="space-y-3">
            <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <Scale size={16} className="text-sky-600" />
                    要素式官方文书撰写
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                    从当前 Word/WPS 文书中提取主体信息、请求事项和事实要素，再严格套用最高人民法院官方模板生成新文档。
                    {platform.platform === 'wps'
                        ? ' 当前宿主为 WPS，系统会优先尝试本地直接打开，失败时自动下载。'
                        : ' 当前宿主为 Word，生成后会直接打开新文档。'}
                </p>
            </div>

            {isMacWps && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    macOS + WPS 提示：如果生成后没有自动打开文书，而是只下载了 `docx`，请在 Finder 中手动打开下载的文件。
                </div>
            )}

            <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700" htmlFor="element-pleading-category">
                        官方分类
                    </label>
                    <select
                        id="element-pleading-category"
                        value={selectedCategory?.id ?? ''}
                        onChange={(event) => {
                            setSelectedCategoryId(event.target.value);
                            setTemplateSearch('');
                        }}
                        disabled={catalogLoading || catalog.length === 0}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-gray-100"
                    >
                        {catalog.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700" htmlFor="element-pleading-template-search">
                        分类内搜索
                    </label>
                    <div className="relative">
                        <Search
                            size={14}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                            id="element-pleading-template-search"
                            type="text"
                            value={templateSearch}
                            onChange={(event) => setTemplateSearch(event.target.value)}
                            disabled={catalogLoading || !selectedCategory}
                            placeholder="按模板名称或案由搜索"
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-gray-100"
                        />
                    </div>
                    {selectedCategory && (
                        <div className="text-[11px] text-gray-500">
                            当前分类共 {selectedCategory.items.length} 份模板
                            {templateSearch.trim() ? `，筛出 ${filteredTemplates.length} 份` : ''}
                        </div>
                    )}
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700" htmlFor="element-pleading-template">
                        官方模板
                    </label>
                    <select
                        id="element-pleading-template"
                        value={selectedTemplate?.templateId ?? ''}
                        onChange={(event) => setSelectedTemplateId(event.target.value)}
                        disabled={catalogLoading || !selectedCategory || filteredTemplates.length === 0}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-gray-100"
                    >
                        {filteredTemplates.map((template) => (
                            <option key={template.templateId} value={template.templateId}>
                                {template.label}
                            </option>
                        ))}
                    </select>
                    {!catalogLoading && selectedCategory && filteredTemplates.length === 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            当前分类下没有匹配的模板，请换个关键词试试。
                        </div>
                    )}
                </div>

                {selectedTemplate && (
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                            <FolderTree size={13} />
                            当前模板
                        </div>
                        <div className="mt-1 text-sm text-gray-800">{selectedTemplate.label}</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                            文书标题：{selectedTemplate.documentTitle}
                            {selectedTemplate.caseTitle ? ` · 案由：${selectedTemplate.caseTitle}` : ''}
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={loading || catalogLoading || !selectedTemplate}
                    className="btn-primary flex w-full items-center justify-center gap-1.5 text-sm"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    生成要素式文书
                </button>
            </div>

            <div className="rounded-xl border border-sky-100 bg-white p-3">
                <div className="flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span>
                        {catalogLoading
                            ? '正在加载官方模板目录'
                            : currentStep
                                ? currentStep.stage === 'waiting'
                                    ? `服务端处理中 · 已等待 ${formatElapsed(waitingSeconds)}`
                                    : currentStep.label
                                : '等待开始'}
                    </span>
                    <span className="text-gray-400">
                        {catalogLoading
                            ? '加载中'
                            : generationStage === 'waiting'
                                ? '请稍候'
                                : generationStage === 'success'
                                    ? '已完成'
                                    : loading
                                        ? '进行中'
                                        : '未开始'}
                    </span>
                </div>

                <div className="mt-3 space-y-2">
                    {generationSteps.map((step) => {
                        const active = generationStage === step.stage;
                        const done = isStageDone(generationStage, step.stage);

                        return (
                            <div
                                key={step.stage}
                                className={clsx(
                                    'flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors',
                                    active ? 'border-sky-300 bg-sky-50' : done ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-100 bg-gray-50',
                                )}
                            >
                                <div className="mt-0.5">
                                    {done ? (
                                        <CheckCircle size={14} className="text-emerald-500" />
                                    ) : active ? (
                                        <Loader2 size={14} className="animate-spin text-sky-600" />
                                    ) : (
                                        <Circle size={14} className="text-gray-300" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium text-gray-800">{step.label}</div>
                                    <div className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{step.description}</div>
                                </div>
                                {active && step.stage === 'waiting' && (
                                    <div className="flex items-center gap-1 text-[11px] text-sky-600">
                                        <Clock size={11} />
                                        {formatElapsed(waitingSeconds)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {platform.platform === 'wps' && lastGeneratedResult && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-800">
                    <div className="flex items-start gap-2">
                        <Download size={15} className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="font-medium">WPS 打开提示</div>
                            <p className="mt-1 leading-relaxed text-blue-700">
                                当前 WPS 链路会优先把生成结果保存到本地临时文件，再尝试直接打开。若宿主不支持，则会自动回退为下载 docx。
                            </p>
                            {lastGeneratedResult.fileName && (
                                <div className="mt-2 rounded border border-blue-100 bg-white/70 px-2 py-2 text-[11px] text-blue-900">
                                    文件名：{lastGeneratedResult.fileName}
                                </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handleRetryOpen}
                                    className="btn-secondary flex items-center gap-1 text-xs"
                                >
                                    <Download size={12} />
                                    再次尝试打开
                                </button>
                                {lastGeneratedResult.fileName && (
                                    <button
                                        type="button"
                                        onClick={handleCopyFileName}
                                        className="btn-secondary flex items-center gap-1 text-xs"
                                    >
                                        <Copy size={12} />
                                        复制文件名
                                    </button>
                                )}
                            </div>
                            {copyStatus === 'success' && (
                                <p className="mt-2 text-[11px] text-emerald-700">已复制文件名。</p>
                            )}
                            {copyStatus === 'error' && (
                                <p className="mt-2 text-[11px] text-amber-700">复制失败，请手动记录文件名。</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {catalogError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{catalogError}</span>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {successMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{successMessage}</span>
                </div>
            )}

            {warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
                        <AlertCircle size={14} />
                        已生成，但有待补充字段
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-700">
                        {warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
