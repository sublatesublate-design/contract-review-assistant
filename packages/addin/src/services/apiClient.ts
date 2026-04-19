/**
 * apiClient.ts
 * Client helpers for review, chat, and litigation APIs.
 * Includes streaming utilities and user-facing fallback error mapping.
 */
import type { ReviewIssue } from '../types/review';
import type { ReviewErrorType } from '../store/reviewStore';
import type { ModelInfo } from '../types/settings';
import type { ContractSummary } from '../types/summary';
import type { LegalDocumentType } from '../types/legalDocument';
import type {
    ElementComplaintApiRequest,
    ElementComplaintApiResponse,
    ElementComplaintBlock,
    ElementComplaintFooter,
    ElementComplaintRenderModel,
    ElementComplaintTableBlock,
    ElementComplaintTableRow,
} from '../types/elementComplaint';
import type {
    ElementPleadingApiRequest,
    ElementPleadingApiResponse,
    ElementPleadingTemplateCategory,
} from '../types/elementPleading';

export interface ReviewStreamRequest {
    content: string;
    documentType: LegalDocumentType;
    provider: string;
    model: string;
    depth: 'quick' | 'standard' | 'deep';
    standpoint?: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;   // Optional provider base URL.
    globalInstruction?: string | undefined;
    selectedTemplate?: { name: string; prompt: string } | undefined;
}

export interface ReviewStreamCallbacks {
    onIssue: (issue: ReviewIssue) => void;
    /** Called when the backend emits a summary event. */
    onSummary: (summary: string, model: string, documentType?: string, documentLabel?: string) => void;
    /** Called when the request fails after error classification. */
    onError: (err: string, errorType?: ReviewErrorType) => void;
}

export interface ChatStreamRequest {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    systemPrompt?: string;
    provider: string;
    model: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;   // Optional provider base URL.
}

export interface ChatStreamCallbacks {
    onDelta: (delta: string) => void;
    onDone: () => void;
    onError: (err: string, errorType?: ReviewErrorType) => void;
}

function extractErrorText(err: unknown): string {
    if (err instanceof Error) {
        return err.message || err.name;
    }
    if (typeof err === 'string') {
        return err;
    }
    if (err && typeof err === 'object') {
        const record = err as Record<string, unknown>;
        const nested = record['message'] ?? record['error'] ?? record['detail'];
        if (typeof nested === 'string' && nested.trim()) {
            return nested;
        }
        try {
            return JSON.stringify(err);
        } catch {
            return String(err);
        }
    }
    return String(err ?? '');
}

function normalizeErrorText(text: string): string {
    return text
        .replace(/^error:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function looksLikeMojibake(text: string): boolean {
    const normalized = normalizeErrorText(text);
    if (!normalized) return false;
    if (normalized.includes('\ufffd')) return true;

    const suspiciousFragments = ['锛', '璇', '鏃', '鍦', '缃', '闄', '閿', '鍚', '宸', '绋', '鏈'];
    let hits = 0;
    for (const fragment of suspiciousFragments) {
        if (normalized.includes(fragment)) {
            hits++;
            if (hits >= 2) return true;
        }
    }

    return false;
}

function shouldExposeRawDetail(text: string): boolean {
    const normalized = normalizeErrorText(text);
    if (!normalized) return false;
    if (looksLikeMojibake(normalized)) return false;
    if (/^script error\.?$/i.test(normalized)) return false;
    if (/^uncaught runtime errors?/i.test(normalized)) return false;
    return normalized.length <= 160;
}

export function toUserFacingError(err: unknown, status?: number): { message: string; errorType: ReviewErrorType } {
    const raw = normalizeErrorText(extractErrorText(err));
    const lower = raw.toLowerCase();

    if (status === 401 || lower.includes('invalid_api_key') || lower.includes('authentication') || lower.includes('unauthorized')) {
        return { message: '\u0041\u0050\u0049\u0020\u004b\u0065\u0079\u0020\u65e0\u6548\uff0c\u8bf7\u5728\u8bbe\u7f6e\u4e2d\u68c0\u67e5\u60a8\u7684\u5bc6\u94a5\u3002', errorType: 'auth' };
    }
    if (status === 429 || lower.includes('rate_limit') || lower.includes('rate limit') || lower.includes('insufficient') || lower.includes('quota')) {
        return { message: '\u4f59\u989d\u4e0d\u8db3\u6216\u89e6\u53d1\u901f\u7387\u9650\u5236\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002', errorType: 'quota' };
    }
    if (lower.includes('failed to fetch') || lower.includes('load failed') || lower.includes('econnrefused') || lower.includes('network') || lower.includes('fetch') || lower.includes('connect')) {
        return { message: '\u65e0\u6cd5\u8fde\u63a5\u670d\u52a1\u5668\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u548c\u670d\u52a1\u5668\u5730\u5740\u3002', errorType: 'network' };
    }
    if (shouldExposeRawDetail(raw)) {
        return { message: raw, errorType: 'unknown' };
    }
    return { message: '\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002', errorType: 'unknown' };
}

/** Maps transport and provider failures to user-facing error buckets. */
function classifyError(err: unknown, status?: number): { message: string; errorType: ReviewErrorType } {
    return toUserFacingError(err, status);
}

/** Detect the Mac Word WKWebView host, which has limited streaming support. */
function isMacWordWebView(): boolean {
    const ua = navigator.userAgent;
    // Windows hosts use Chromium-based webviews and should not match here.
    return /Macintosh/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome/.test(ua);
}

/**
 * Fallback SSE transport for Mac Word.
 * WKWebView does not reliably support fetch streaming or XHR progress events.
 * Create the job with POST /init, then subscribe via EventSource.
 */
async function sseViaEventSource(
    initUrl: string,
    streamUrlBase: string,
    body: string,
    handlers: { onEvent: (data: Record<string, unknown>) => void }
): Promise<void> {
    // Phase 1: create the job and read back the jobId.
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

    // Phase 2: subscribe to the stream with EventSource.
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
            } catch { /* Ignore malformed JSON chunks. */ }
        };
        es.onerror = () => {
            es.close();
            reject(new Error('Load failed'));
        };
    });
}

/** Retry transient fetch failures and 5xx responses. */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const resp = await fetch(url, options);
            // Retry transient 5xx responses.
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

function toStringValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value == null) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function normalizeAlign(value: unknown): 'left' | 'center' | 'right' | 'justify' | undefined {
    return value === 'left' || value === 'center' || value === 'right' || value === 'justify'
        ? value
        : undefined;
}

function normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => toStringValue(item)).filter((item) => item.trim().length > 0);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.split(/\r?\n+/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
}

function normalizeTableRow(row: unknown): ElementComplaintTableRow | null {
    if (!row || typeof row !== 'object') return null;
    const record = row as Record<string, unknown>;
    if (record['type'] === 'full') {
        return {
            type: 'full',
            text: toStringValue(record['text'] ?? record['value'] ?? ''),
            bold: Boolean(record['bold']),
            align: normalizeAlign(record['align']),
        };
    }
    return {
        type: 'pair',
        label: toStringValue(record['label'] ?? record['name'] ?? ''),
        value: toStringValue(record['value'] ?? record['content'] ?? record['text'] ?? ''),
        labelBold: Boolean(record['labelBold']),
        valueBold: Boolean(record['valueBold']),
    };
}

function normalizeBlock(block: unknown): ElementComplaintBlock | null {
    if (!block || typeof block !== 'object') return null;
    const record = block as Record<string, unknown>;
    const blockType = toStringValue(record['type']);

    if (blockType === 'paragraph') {
        return {
            type: 'paragraph',
            text: toStringValue(record['text'] ?? record['content'] ?? ''),
            align: normalizeAlign(record['align']),
            bold: Boolean(record['bold']),
        };
    }

    if (
        blockType === 'table'
        || blockType === 'party-table'
        || blockType === 'claim-table'
        || blockType === 'fact-table'
        || blockType === 'tail-table'
    ) {
        const rows = Array.isArray(record['rows'])
            ? record['rows'].map(normalizeTableRow).filter((item): item is ElementComplaintTableRow => item !== null)
            : [];
        return {
            type: 'table',
            title: record['title'] != null ? toStringValue(record['title']) : undefined,
            rows,
        } satisfies ElementComplaintTableBlock;
    }

    return null;
}

function normalizeFooter(value: unknown): ElementComplaintFooter {
    if (!value || typeof value !== 'object') {
        return { lines: [] };
    }
    const record = value as Record<string, unknown>;
    const align = record['align'];
    const explicitLines = normalizeStringArray(record['lines'] ?? record['text'] ?? record['items']);

    if (explicitLines.length > 0) {
        return {
            lines: explicitLines,
            align: align === 'left' || align === 'center' || align === 'right' ? align : undefined,
        };
    }

    const court = toStringValue(record['court']).trim();
    const signerLabel = toStringValue(record['signerLabel']).trim();
    const dateLabel = toStringValue(record['dateLabel']).trim();
    const derivedLines = [
        court ? '\u6b64\u81f4' : '',
        court,
        signerLabel ? signerLabel + '\uff1a' : '',
        dateLabel ? dateLabel + '\uff1a' : '',
    ].filter((line) => line.trim().length > 0);

    return {
        lines: derivedLines,
        align: align === 'left' || align === 'center' || align === 'right' ? align : undefined,
    };
}

function normalizeElementComplaintRenderModel(value: unknown): ElementComplaintRenderModel {
    if (!value || typeof value !== 'object') {
        return {
            title: { main: '\u6c11\u4e8b\u8d77\u8bc9\u72b6' },
            instructions: [],
            blocks: [],
            footer: { lines: [] },
        };
    }

    const record = value as Record<string, unknown>;
    const titleValue = record['title'];
    const titleObject = titleValue && typeof titleValue === 'object' ? titleValue as Record<string, unknown> : {};

    return {
        title: {
            main: toStringValue(titleObject['main'] ?? titleObject['primary'] ?? titleValue ?? record['caseType'] ?? '\u6c11\u4e8b\u8d77\u8bc9\u72b6'),
            sub: toStringValue(titleObject['sub'] ?? titleObject['subtitle'] ?? record['caseType'] ?? '').trim() || undefined,
        },
        instructions: normalizeStringArray(record['instructions']),
        blocks: Array.isArray(record['blocks'])
            ? record['blocks'].map(normalizeBlock).filter((item): item is ElementComplaintBlock => item !== null)
            : [],
        footer: normalizeFooter(record['footer']),
    };
}

function normalizeElementPleadingResponse(value: unknown): ElementPleadingApiResponse {
    if (!value || typeof value !== 'object') {
        return {
            base64Docx: '',
            warnings: [],
        };
    }

    const record = value as Record<string, unknown>;
    const base64Docx = toStringValue(
        record['base64Docx']
        ?? record['docxBase64']
        ?? record['docBase64']
        ?? record['documentBase64']
        ?? record['content']
    );

    return {
        base64Docx,
        fileName: toStringValue(record['fileName'] ?? record['filename'] ?? record['name']).trim() || undefined,
        warnings: normalizeStringArray(record['warnings']),
    };
}

export const apiClient = {
    /**
     * Stream contract review issues and summary updates.
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

        // Mac Word WKWebView falls back to EventSource-based SSE.
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
     * Stream AI chat responses.
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

        // Mac Word WKWebView falls back to EventSource-based SSE.
        if (isMacWordWebView()) {
            try {
                await sseViaEventSource(
                    `${baseUrl}/api/chat/init`,
                    `${baseUrl}/api/chat/stream`,
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
     * Load the model list from the backend.
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
     * Fetch a contract summary.
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
                throw new Error(errorData.error || ('\u6458\u8981\u751f\u6210\u5931\u8d25 (' + res.status + ')'));
            }

            return await res.json() as ContractSummary;
        } catch (err) {
            console.error('[API] getSummary error:', err);
            throw err;
        }
    },

    async generateElementComplaint(
        req: ElementComplaintApiRequest,
        serverUrl: string = ''
    ): Promise<ElementComplaintApiResponse> {
        const baseUrl = serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin;
        const response = await fetchWithRetry(`${baseUrl}/api/litigation/element-complaint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });

        if (!response.ok) {
            let message = '';
            try {
                const payload = await response.json() as Record<string, unknown>;
                message = toStringValue(payload['error'] ?? payload['message'] ?? payload['detail']);
            } catch {
                message = await response.text().catch(() => '');
            }
            throw new Error(message || `\u8981\u7d20\u5f0f\u8d77\u8bc9\u72b6\u8f6c\u6362\u5931\u8d25 (${response.status})`);
        }

        const payload = await response.json() as Record<string, unknown>;
        const confidenceValue = payload['confidence'];
        const confidence = typeof confidenceValue === 'number'
            ? confidenceValue
            : confidenceValue === 'high'
                ? 0.9
                : confidenceValue === 'medium'
                    ? 0.7
                    : confidenceValue === 'low'
                        ? 0.5
                        : Number(confidenceValue ?? 0) || 0;

        return {
            detectedCaseType: toStringValue(payload['detectedCaseType'] ?? ''),
            confidence,
            renderModel: normalizeElementComplaintRenderModel(payload['renderModel']),
            warnings: normalizeStringArray(payload['warnings']),
        };
    },

    async generateElementPleadingDocx(
        req: ElementPleadingApiRequest,
        serverUrl: string = ''
    ): Promise<ElementPleadingApiResponse> {
        const baseUrl = serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin;
        const response = await fetchWithRetry(`${baseUrl}/api/litigation/element-pleading-docx`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });

        if (!response.ok) {
            let message = '';
            try {
                const payload = await response.json() as Record<string, unknown>;
                message = toStringValue(payload['error'] ?? payload['message'] ?? payload['detail']);
            } catch {
                message = await response.text().catch(() => '');
            }
            throw new Error(message || `\u8981\u7d20\u5f0f\u8d77\u8bc9\u72b6 docx \u751f\u6210\u5931\u8d25 (${response.status})`);
        }

        const payload = await response.json();
        const normalized = normalizeElementPleadingResponse(payload);
        if (!normalized.base64Docx) {
            throw new Error('\u670d\u52a1\u7aef\u672a\u8fd4\u56de\u6709\u6548\u7684 docx \u5185\u5bb9');
        }
        return normalized;
    },

    async getElementPleadingTemplates(serverUrl: string = ''): Promise<ElementPleadingTemplateCategory[]> {
        const baseUrl = serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin;
        const response = await fetchWithRetry(`${baseUrl}/api/litigation/element-pleading-templates`, {
            method: 'GET',
        });

        if (!response.ok) {
            let message = '';
            try {
                const payload = await response.json() as Record<string, unknown>;
                message = toStringValue(payload['error'] ?? payload['message'] ?? payload['detail']);
            } catch {
                message = await response.text().catch(() => '');
            }
            throw new Error(message || ('\u83b7\u53d6\u8981\u7d20\u5f0f\u6587\u4e66\u6a21\u677f\u5931\u8d25 (' + response.status + ')'));
        }

        const payload = await response.json() as { categories?: ElementPleadingTemplateCategory[] };
        return Array.isArray(payload.categories) ? payload.categories : [];
    },

    // MCP server management.
    async getMcpServers(serverUrl?: string): Promise<McpServerStatus[]> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers`);
        if (!res.ok) throw new Error('\u83b7\u53d6 MCP \u670d\u52a1\u5668\u5217\u8868\u5931\u8d25 (' + res.status + ')');
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
            throw new Error((data['error'] as string) || ('\u65b0\u589e MCP \u670d\u52a1\u5668\u5931\u8d25 (' + res.status + ')'));
        }
    },

    async removeMcpServer(serverId: string, serverUrl?: string): Promise<void> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers/${serverId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('\u5220\u9664 MCP \u670d\u52a1\u5668\u5931\u8d25 (' + res.status + ')');
    },

    async reconnectMcpServer(serverId: string, serverUrl?: string): Promise<void> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers/${serverId}/reconnect`, { method: 'POST' });
        if (!res.ok) throw new Error('\u91cd\u8fde MCP \u670d\u52a1\u5668\u5931\u8d25 (' + res.status + ')');
    },

    async getMcpTools(serverUrl?: string): Promise<McpToolInfo[]> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/tools`);
        if (!res.ok) throw new Error('\u83b7\u53d6 MCP \u5de5\u5177\u5217\u8868\u5931\u8d25 (' + res.status + ')');
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
 * Consume a standard text/event-stream response.
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
                    // Ignore malformed JSON chunks.
                }
            }
        }
    }
}
