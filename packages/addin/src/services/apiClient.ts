/**
 * apiClient.ts
 * 前端与后端 Express 服务通信的封装层
 * 新增：错误分类（auth/quota/network/unknown）+ 网络错误自动重试（最多 2 次）
 */
import type { ReviewIssue } from '../types/review';
import type { ReviewErrorType } from '../store/reviewStore';
import type { ModelInfo } from '../types/settings';
import type { ContractSummary } from '../types/summary';
import type { LegalDocumentType } from '../types/legalDocument';

export interface ReviewStreamRequest {
    content: string;
    documentType: LegalDocumentType;
    provider: string;
    model: string;
    depth: 'quick' | 'standard' | 'deep';
    standpoint?: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;   // OpenAI 兼容接口（DeepSeek/本地代理等）
    globalInstruction?: string | undefined;
    selectedTemplate?: { name: string; prompt: string } | undefined;
}

export interface ReviewStreamCallbacks {
    onIssue: (issue: ReviewIssue) => void;
    /** summary 带可选文书类型信息 */
    onSummary: (summary: string, model: string, documentType?: string, documentLabel?: string) => void;
    /** 错误回调，附带分类类型 */
    onError: (err: string, errorType?: ReviewErrorType) => void;
}

export interface ChatStreamRequest {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    systemPrompt?: string;
    provider: string;
    model: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;   // OpenAI 兼容接口
}

export interface ChatStreamCallbacks {
    onDelta: (delta: string) => void;
    onDone: () => void;
    onError: (err: string) => void;
}

/** 根据错误信息/状态码分类 */
function classifyError(err: unknown, status?: number): { message: string; errorType: ReviewErrorType } {
    const raw = err instanceof Error ? err.message : String(err);
    const lower = raw.toLowerCase();

    if (status === 401 || lower.includes('invalid_api_key') || lower.includes('authentication') || lower.includes('unauthorized')) {
        return { message: `API Key 无效，请在设置中检查您的密钥（${raw}）`, errorType: 'auth' };
    }
    if (status === 429 || lower.includes('rate_limit') || lower.includes('rate limit') || lower.includes('insufficient') || lower.includes('quota')) {
        return { message: `余额不足或达到速率限制，请稍后再试（${raw}）`, errorType: 'quota' };
    }
    if (lower.includes('failed to fetch') || lower.includes('load failed') || lower.includes('econnrefused') || lower.includes('network') || lower.includes('fetch') || lower.includes('connect')) {
        return { message: `无法连接服务器，请检查网络和服务地址（${raw}）`, errorType: 'network' };
    }
    return { message: raw, errorType: 'unknown' };
}

/** 检测是否为 Mac Word 的 WKWebView（不支持 fetch/XHR 流式 ReadableStream） */
function isMacWordWebView(): boolean {
    const ua = navigator.userAgent;
    // Mac + WebKit 但非 Chrome/Chromium（WPS 使用 CEF/Chromium，不受影响）
    return /Macintosh/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome/.test(ua);
}

/**
 * 通过 EventSource（原生 SSE）实现流式消费
 * WKWebView 的 fetch ReadableStream 和 XHR onprogress 都会缓冲响应，
 * 但原生 EventSource API 可正常逐事件触发。
 * 流程：POST /init 创建作业 → GET /stream/:jobId 用 EventSource 消费
 */
async function sseViaEventSource(
    initUrl: string,
    streamUrlBase: string,
    body: string,
    handlers: { onEvent: (data: Record<string, unknown>) => void }
): Promise<void> {
    // Phase 1: POST 创建作业，获取 jobId
    const initRes = await fetch(initUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    if (!initRes.ok) {
        const text = await initRes.text().catch(() => '');
        throw Object.assign(new Error(text || `HTTP ${initRes.status}`), { status: initRes.status });
    }
    const { jobId } = (await initRes.json()) as { jobId: string };

    // Phase 2: EventSource 流式消费
    return new Promise<void>((resolve, reject) => {
        const es = new EventSource(`${streamUrlBase}/${jobId}`);
        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as Record<string, unknown>;
                handlers.onEvent(data);
                if (data['type'] === 'done' || data['type'] === 'error') {
                    es.close();
                    resolve();
                }
            } catch { /* 忽略非 JSON */ }
        };
        es.onerror = () => {
            es.close();
            reject(new Error('Load failed'));
        };
    });
}

/** 带重试的 fetch：仅限网络错误，最多 2 次，每次延迟 2s */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const resp = await fetch(url, options);
            // 5xx 服务端错误才重试
            if (resp.status >= 500 && attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }
            return resp;
        } catch (err) {
            lastErr = err;
            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
    }
    throw lastErr;
}

export const apiClient = {
    /**
     * 发起文稿审校（SSE 流式）
     */
    async reviewStream(
        req: ReviewStreamRequest,
        serverUrl: string,
        callbacks: ReviewStreamCallbacks
    ): Promise<void> {
        const baseUrl = serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin;
        const url = `${baseUrl}/api/review`;
        const body = JSON.stringify(req);

        const onEvent = (data: Record<string, unknown>) => {
            if (data['type'] === 'issue') callbacks.onIssue(data['data'] as ReviewIssue);
            else if (data['type'] === 'summary')
                callbacks.onSummary(
                    data['content'] as string,
                    data['model'] as string,
                    data['documentType'] as string | undefined,
                    data['documentLabel'] as string | undefined,
                );
            else if (data['type'] === 'error') {
                const { message, errorType } = classifyError(data['message'] as string);
                callbacks.onError(message, errorType);
            }
        };

        // Mac Word (WKWebView) 的 fetch/XHR 都会缓冲 SSE 响应，改用原生 EventSource
        if (isMacWordWebView()) {
            try {
                await sseViaEventSource(
                    `${baseUrl}/api/review/init`,
                    `${baseUrl}/api/review/stream`,
                    body,
                    { onEvent },
                );
            } catch (err) {
                const { message, errorType } = classifyError(err);
                callbacks.onError(message, errorType);
            }
            return;
        }

        let response: Response;
        try {
            response = await fetchWithRetry(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
        } catch (err) {
            const { message, errorType } = classifyError(err);
            callbacks.onError(message, errorType);
            return;
        }

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            const { message, errorType } = classifyError(text || `HTTP ${response.status}`, response.status);
            callbacks.onError(message, errorType);
            return;
        }

        await consumeSSE(response, { onEvent });
    },

    /**
     * AI 对话（SSE 流式）
     */
    async chatStream(
        req: ChatStreamRequest,
        serverUrl: string,
        callbacks: ChatStreamCallbacks
    ): Promise<void> {
        const baseUrl = serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin;
        const url = `${baseUrl}/api/chat`;
        const body = JSON.stringify(req);

        const onEvent = (data: Record<string, unknown>) => {
            if (data['type'] === 'delta') callbacks.onDelta(data['content'] as string);
            else if (data['type'] === 'done') callbacks.onDone();
            else if (data['type'] === 'error') callbacks.onError(data['message'] as string);
        };

        // Mac Word (WKWebView) 的 fetch/XHR 都会缓冲 SSE 响应，改用原生 EventSource
        if (isMacWordWebView()) {
            try {
                await sseViaEventSource(
                    `${baseUrl}/api/chat/init`,
                    `${baseUrl}/api/chat/stream`,
                    body,
                    { onEvent },
                );
            } catch (err) {
                callbacks.onError(err instanceof Error ? err.message : String(err));
            }
            return;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (!response.ok) {
            const err = await response.text();
            callbacks.onError(`服务器错误 ${response.status}: ${err}`);
            return;
        }

        await consumeSSE(response, { onEvent });
    },

    /**
     * 获取可用模型列表
     */
    async getModels(serverUrl: string): Promise<ModelInfo[]> {
        try {
            const baseUrl = serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin;
            const response = await fetch(`${baseUrl}/api/models`);
            if (!response.ok) return [];
            return (await response.json()) as ModelInfo[];
        } catch {
            return [];
        }
    },

    /**
     * 获取结构化文稿摘要（非流式）
     */
    async getSummary(
        req: Omit<ReviewStreamRequest, 'depth' | 'customTemplates' | 'standpoint'>,
        serverUrl: string = ''
    ): Promise<ContractSummary> {
        const url = `${serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin}/api/summary`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req),
            });

            if (!res.ok) {
                let errorData;
                try {
                    errorData = await res.json();
                } catch {
                    errorData = { error: res.statusText };
                }
                throw new Error(errorData.error || `请求失败 (${res.status})`);
            }

            return await res.json() as ContractSummary;
        } catch (err) {
            console.error('[API] getSummary error:', err);
            throw err;
        }
    },

    // ── MCP 管理 ─────────────────────────────────────────────
    async getMcpServers(serverUrl?: string): Promise<McpServerStatus[]> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers`);
        if (!res.ok) throw new Error(`获取 MCP 服务器列表失败 (${res.status})`);
        return await res.json() as McpServerStatus[];
    },

    async addMcpServer(config: McpServerConfig, serverUrl?: string): Promise<void> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({})) as Record<string, unknown>;
            throw new Error((data['error'] as string) || `添加失败 (${res.status})`);
        }
    },

    async removeMcpServer(serverId: string, serverUrl?: string): Promise<void> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers/${serverId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`删除失败 (${res.status})`);
    },

    async reconnectMcpServer(serverId: string, serverUrl?: string): Promise<void> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers/${serverId}/reconnect`, { method: 'POST' });
        if (!res.ok) throw new Error(`重连失败 (${res.status})`);
    },

    async getMcpTools(serverUrl?: string): Promise<McpToolInfo[]> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/tools`);
        if (!res.ok) throw new Error(`获取工具列表失败 (${res.status})`);
        return await res.json() as McpToolInfo[];
    },
};

export interface McpServerConfig {
    id: string;
    name: string;
    transport: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    enabled: boolean;
}

export interface McpServerStatus extends McpServerConfig {
    connected: boolean;
    toolCount: number;
}

export interface McpToolInfo {
    name: string;
    description: string;
    serverId: string;
    originalName: string;
}

/**
 * 通用 SSE 消费函数
 */
async function consumeSSE(
    response: Response,
    handlers: { onEvent: (data: Record<string, unknown>) => void }
): Promise<void> {
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (!jsonStr) continue;
                try {
                    const data = JSON.parse(jsonStr) as Record<string, unknown>;
                    handlers.onEvent(data);
                } catch {
                    // 忽略非 JSON 行
                }
            }
        }
    }
}
