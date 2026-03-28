import type { IPlatformAdapter, PlatformType } from '../types';
import { WpsDocumentReader } from './wpsDocumentReader';
import { WpsRangeMapper } from './wpsRangeMapper';
import { WpsCommentManager } from './wpsCommentManager';
import { WpsTrackChangesManager } from './wpsTrackChanges';
import { WpsNavigationHelper } from './wpsNavigation';
import { WpsReportGenerator } from './wpsReportGenerator';
import { WpsClauseInserter } from './wpsClauseInserter';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function normalizeBase64Docx(base64Docx: string): string {
    const trimmed = base64Docx.trim();
    const prefixMatch = trimmed.match(/^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,/i);
    return prefixMatch ? trimmed.slice(prefixMatch[0].length) : trimmed;
}

function base64ToBlob(base64Docx: string): Blob {
    const normalized = normalizeBase64Docx(base64Docx);
    const binary = window.atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: DOCX_MIME_TYPE });
}

function normalizeDownloadFileName(fileName?: string): string {
    const trimmed = (fileName || '').trim();
    const safeName = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
    const resolved = safeName || '\u8981\u7d20\u5f0f\u6587\u4e66';
    return resolved.toLowerCase().endsWith('.docx') ? resolved : `${resolved}.docx`;
}

async function saveTempDocx(base64Docx: string, fileName?: string): Promise<string> {
    const response = await fetch('/api/files/save-temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            base64: base64Docx,
            fileName,
        }),
    });

    if (!response.ok) {
        let message = '';
        try {
            const payload = await response.json() as Record<string, unknown>;
            message = String(payload['error'] ?? payload['message'] ?? '');
        } catch {
            message = await response.text().catch(() => '');
        }
        throw new Error(message || `\u4fdd\u5b58\u4e34\u65f6\u6587\u6863\u5931\u8d25 (${response.status})`);
    }

    const payload = await response.json() as { filePath?: string };
    if (!payload.filePath) {
        throw new Error('\u670d\u52a1\u7aef\u672a\u8fd4\u56de\u6709\u6548\u7684\u4e34\u65f6\u6587\u4ef6\u8def\u5f84');
    }

    return payload.filePath;
}

async function downloadFallback(base64Docx: string, fileName?: string): Promise<void> {
    const blob = base64ToBlob(base64Docx);
    const resolvedFileName = normalizeDownloadFileName(fileName);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');

    link.href = downloadUrl;
    link.download = resolvedFileName;
    link.style.display = 'none';
    window.document.body.appendChild(link);
    link.click();
    link.remove();

    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    window.setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);
    console.log('[WpsAdapter] fallback download generated pleading docx:', resolvedFileName);
}

export class WpsAdapter implements IPlatformAdapter {
    public readonly platform: PlatformType = 'wps';
    public readonly documentReader = new WpsDocumentReader();
    public readonly rangeMapper = new WpsRangeMapper();
    public readonly commentManager = new WpsCommentManager();
    public readonly trackChangesManager = new WpsTrackChangesManager();
    public readonly navigationHelper = new WpsNavigationHelper();
    public readonly reportGenerator = new WpsReportGenerator();

    public readonly openGeneratedDocx = async (
        base64Docx: string,
        fileName?: string,
    ): Promise<void> => {
        if (!base64Docx.trim()) {
            throw new Error('\u751f\u6210\u7684 docx \u5185\u5bb9\u4e3a\u7a7a');
        }

        try {
            if (!window.wps) {
                throw new Error('WPS JSAPI \u4e0d\u53ef\u7528');
            }

            const filePath = await saveTempDocx(base64Docx, fileName);
            const app = window.wps.WpsApplication() as _wps.Application;
            const documents = app.Documents as _wps.Documents & { Open?: (fileName: string) => _wps.Document };

            if (typeof documents.Open !== 'function') {
                throw new Error('\u5f53\u524d WPS \u5bbf\u4e3b\u672a\u63d0\u4f9b Documents.Open\uff0c\u5df2\u56de\u9000\u4e3a\u4e0b\u8f7d\u6a21\u5f0f');
            }

            documents.Open(filePath);
            console.log('[WpsAdapter] opened generated pleading docx from local path:', filePath);
        } catch (error) {
            console.warn('[WpsAdapter] local open failed, fallback to download:', error);
            await downloadFallback(base64Docx, fileName);
        }
    };

    public readonly clauseInserter = new WpsClauseInserter();

    public async initialize(): Promise<boolean> {
        return this.isAvailable();
    }

    public invalidateMappingCache(): void {
        this.rangeMapper.invalidateCache();
    }

    public isAvailable(): boolean {
        return typeof window !== 'undefined' && !!window.wps;
    }
}

export function createWpsAdapter(): IPlatformAdapter {
    return new WpsAdapter();
}
