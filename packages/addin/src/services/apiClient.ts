/**
 * apiClient.ts
 * 闁告挸绉堕顒佺▔鎼粹剝鍊电紒?Express 闁哄牆绉存慨鐔兼焻濮橆偂绻嗛柣銊ュ閻ㄦ繄鎲楅崨顓犳勾
 * 闁哄倹婢橀·鍐晬濮樿埖鏅╅悹鍥跺灠閸ㄥ海鐚炬导娆戠auth/quota/network/unknown闁? 缂傚啯鍨圭划鍫曟煥濞嗘帩鍤栭柤濂変簻婵晠鏌屽鍫㈡Ц闁挎稑鐗婂〒鑸靛緞?2 婵炲棌妲勭槐?
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
    baseUrl?: string | undefined;   // OpenAI 闁稿繒鍘ч鎰板箳閵夈儱缍撻柨娑樻箳eepSeek/闁哄牜鍓欏﹢瀛樼閿濆洦鍊炵紒娑橆檧缁?
    globalInstruction?: string | undefined;
    selectedTemplate?: { name: string; prompt: string } | undefined;
}

export interface ReviewStreamCallbacks {
    onIssue: (issue: ReviewIssue) => void;
    /** summary 閻㈩垽绠戣ぐ鏌ユ焻婢跺鐎☉鏃撳鐞氼偊宕圭€ｂ晙绻嗛柟?*/
    onSummary: (summary: string, model: string, documentType?: string, documentLabel?: string) => void;
    /** 闂佹寧鐟ㄩ銈夊炊閻愬墎娈堕柨娑樼焸濡绢喚鏁敃鈧崹搴ｇ尵閼姐倛顫﹂柛?*/
    onError: (err: string, errorType?: ReviewErrorType) => void;
}

export interface ChatStreamRequest {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    systemPrompt?: string;
    provider: string;
    model: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;   // OpenAI 闁稿繒鍘ч鎰板箳閵夈儱缍?
}

export interface ChatStreamCallbacks {
    onDelta: (delta: string) => void;
    onDone: () => void;
    onError: (err: string, errorType?: ReviewErrorType) => void;
}

/** 闁哄秷顫夊畵渚€鏌ㄥ▎鎺濆殩濞ｅ洠鍓濇导?闁绘鍩栭埀顑胯兌閻栨粓宕氶崱娆掝潶 */
function classifyError(err: unknown, status?: number): { message: string; errorType: ReviewErrorType } {
    const raw = err instanceof Error ? err.message : String(err);
    const lower = raw.toLowerCase();

    if (status === 401 || lower.includes('invalid_api_key') || lower.includes('authentication') || lower.includes('unauthorized')) {
        return { message: `API Key 鏃犳晥锛岃鍦ㄨ缃腑妫€鏌ユ偍鐨勫瘑閽ワ紙${raw}锛塦`, errorType: 'auth' };
    }
    if (status === 429 || lower.includes('rate_limit') || lower.includes('rate limit') || lower.includes('insufficient') || lower.includes('quota')) {
        return { message: `浣欓涓嶈冻鎴栬揪鍒伴€熺巼闄愬埗锛岃绋嶅悗鍐嶈瘯锛?{raw}锛塦`, errorType: 'quota' };
    }
    if (lower.includes('failed to fetch') || lower.includes('load failed') || lower.includes('econnrefused') || lower.includes('network') || lower.includes('fetch') || lower.includes('connect')) {
        return { message: `鏃犳硶杩炴帴鏈嶅姟鍣紝璇锋鏌ョ綉缁滃拰鏈嶅姟鍦板潃锛?{raw}锛塦`, errorType: 'network' };
    }
    return { message: raw, errorType: 'unknown' };
}

/** 婵☆偀鍋撴繛鏉戭儐濡叉悂宕ラ敂鑳 Mac Word 闁?WKWebView闁挎稑鐗呯粭澶愬绩椤栨稑鐦?fetch/XHR 婵炵繝绀佺槐?ReadableStream闁?*/
function isMacWordWebView(): boolean {
    const ua = navigator.userAgent;
    // Mac + WebKit 濞达絽妫濆?Chrome/Chromium闁挎稑婀筆S 濞达綀娉曢弫?CEF/Chromium闁挎稑濂旂粭澶愬矗濡も偓婵傛牠宕蹇曠
    return /Macintosh/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome/.test(ua);
}

/**
 * 闂侇偅淇虹换?EventSource闁挎稑鐗嗙敮顐︽偨?SSE闁挎稑顦悿鍕偝閻楀牏銈︾€殿喖绻戠粔椋庢嫻?
 * WKWebView 闁?fetch ReadableStream 闁?XHR onprogress 闂侇喗鍨濈槐鎵磽閹惧啿鏆遍柛婵嗙Т缁ㄦ煡鏁?
 * 濞达絽妫楃敮顐︽偨?EventSource API 闁告瑯鍨遍婊呮暜閹间讲鍋撻幇顏嗙殤濞寸姵鍎艰闁告瑦鍨埀?
 * 婵炵繝鑳堕埢濂告晬濮濆尗ST /init 闁告帗绋戠紓鎾存媴濠娾偓缁?闁?GET /stream/:jobId 闁?EventSource 婵炴垵鐗愰崹?
 */
async function sseViaEventSource(
    initUrl: string,
    streamUrlBase: string,
    body: string,
    handlers: { onEvent: (data: Record<string, unknown>) => void }
): Promise<void> {
    // Phase 1: POST 闁告帗绋戠紓鎾存媴濠娾偓缁楃喖鏁嶅畝鍐ㄧ闁?jobId
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

    // Phase 2: EventSource 婵炵繝绀佺槐鈥斥槈閸絽鐎?
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
            } catch { /* 闊洨鏅弳鎰版?JSON */ }
        };
        es.onerror = () => {
            es.close();
            reject(new Error('Load failed'));
        };
    });
}

/** 閻㈩垽绠撻崳鍝ユ嫚閺囩姵鐣?fetch闁挎稒鐭划搴ㄦ⒔閹邦喚绉圭紓浣圭矒閺佸﹦鎷犻銈囩闁哄牃鍋撳?2 婵炲棌妲勭槐婵喰掕箛鏃戝仹鐎点倖鍎肩换?2s */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const resp = await fetch(url, options);
            // 5xx 闁哄牆绉存慨鐔虹博椤栫偞鏅╅悹鍥跺灡婢х娀鏌屽鍫㈡Ц
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
        court ? '姝よ嚧' : '',
        court,
        signerLabel ? `${signerLabel}锛歚` : '',
        dateLabel ? `${dateLabel}锛歚` : '',
    ].filter((line) => line.trim().length > 0);

    return {
        lines: derivedLines,
        align: align === 'left' || align === 'center' || align === 'right' ? align : undefined,
    };
}

function normalizeElementComplaintRenderModel(value: unknown): ElementComplaintRenderModel {
    if (!value || typeof value !== 'object') {
        return {
            title: { main: '姘戜簨璧疯瘔鐘?' },
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
            main: toStringValue(titleObject['main'] ?? titleObject['primary'] ?? titleValue ?? record['caseType'] ?? '姘戜簨璧疯瘔鐘?'),
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
     * 闁告瑦鍨奸幑锝夊棘閸モ晩鐒鹃悗鍏夊墲閻楀酣鏁嶉崷鐜圗 婵炵繝绀佺槐锟犳晬?
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

        // Mac Word (WKWebView) 闁?fetch/XHR 闂侇喗鍨濈槐鎵磽閹惧啿鏆?SSE 闁告繂绉寸花鏌ユ晬鐏炵偓鏆柣顫妼鐢偊鎮?EventSource
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
     * AI 閻庣數顢婇惁浠嬫晬閸︾巿E 婵炵繝绀佺槐锟犳晬?
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

        // Mac Word (WKWebView) 闁?fetch/XHR 闂侇喗鍨濈槐鎵磽閹惧啿鏆?SSE 闁告繂绉寸花鏌ユ晬鐏炵偓鏆柣顫妼鐢偊鎮?EventSource
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
     * 闁兼儳鍢茶ぐ鍥矗椤栨粍鏆忔俊顖椻偓宕団偓鐑藉礆濡ゅ嫨鈧?
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
     * 闁兼儳鍢茶ぐ鍥╃磼閹惧鈧垶宕犻弽銊︾€紒瀣閹插磭鎲版笟濠勭闂傚牏鍋炵粊锕€顕ｈ箛銉х
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
                throw new Error(errorData.error || `閻犲洭鏀遍惇鐗堝緞鏉堫偉袝 (${res.status})`);
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
            throw new Error(message || `闁兼儳鍢茶ぐ鍥┾偓瑙勆戦弻鐔肺熼埄鍐╃凡闁烩晩鍠栫紞宥嗗緞鏉堫偉袝 (${response.status})`);
        }

        const payload = await response.json() as { categories?: ElementPleadingTemplateCategory[] };
        return Array.isArray(payload.categories) ? payload.categories : [];
    },

    // 闁冲厜鍋撻柍鍏夊亾 MCP 缂佺媴绱曢幃?闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?
    async getMcpServers(serverUrl?: string): Promise<McpServerStatus[]> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers`);
        if (!res.ok) throw new Error(`闁兼儳鍢茶ぐ?MCP 闁哄牆绉存慨鐔煎闯閵娿儱鐏欓悶娑栧妼閵囨垹鎷?(${res.status})`);
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
            throw new Error((data['error'] as string) || `婵烇綀顕ф慨鐐村緞鏉堫偉袝 (${res.status})`);
        }
    },

    async removeMcpServer(serverId: string, serverUrl?: string): Promise<void> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers/${serverId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`闁告帞濞€濞呭孩寰勬潏顐バ?(${res.status})`);
    },

    async reconnectMcpServer(serverId: string, serverUrl?: string): Promise<void> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/servers/${serverId}/reconnect`, { method: 'POST' });
        if (!res.ok) throw new Error(`闂佹彃绉风换娑欏緞鏉堫偉袝 (${res.status})`);
    },

    async getMcpTools(serverUrl?: string): Promise<McpToolInfo[]> {
        const base = serverUrl || window.location.origin;
        const res = await fetch(`${base}/api/mcp/tools`);
        if (!res.ok) throw new Error(`闁兼儳鍢茶ぐ鍥ь啅閵夈儱寰旈柛鎺擃殙閵嗗啯寰勬潏顐バ?(${res.status})`);
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
 * 闂侇偅姘ㄩ弫?SSE 婵炴垵鐗愰崹鍌炲礄閼恒儲娈?
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
                    // 闊洨鏅弳鎰版?JSON 閻?
                }
            }
        }
    }
}
