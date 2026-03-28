import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getStateRoot } from '../stateRoot';

const TEMP_DOC_DIR = path.join(getStateRoot(), 'generated-docx');
const TEMP_DOC_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeBase64Docx(base64Docx: string): string {
    const trimmed = base64Docx.trim();
    const prefixMatch = trimmed.match(/^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,/i);
    return prefixMatch ? trimmed.slice(prefixMatch[0].length) : trimmed;
}

function ensureTempDir(): void {
    fs.mkdirSync(TEMP_DOC_DIR, { recursive: true });
}

function sanitizeFileName(fileName?: string): string {
    const trimmed = (fileName || '').trim();
    const cleaned = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
    const fallback = cleaned || '\u8981\u7d20\u5f0f\u6587\u4e66';
    return fallback.toLowerCase().endsWith('.docx') ? fallback : `${fallback}.docx`;
}

function pruneExpiredFiles(now = Date.now()): void {
    ensureTempDir();

    for (const entry of fs.readdirSync(TEMP_DOC_DIR, { withFileTypes: true })) {
        if (!entry.isFile()) {
            continue;
        }

        const filePath = path.join(TEMP_DOC_DIR, entry.name);
        try {
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > TEMP_DOC_TTL_MS) {
                fs.rmSync(filePath, { force: true });
            }
        } catch {
            fs.rmSync(filePath, { force: true });
        }
    }
}

export function saveTemporaryDocx(base64Docx: string, fileName?: string): { filePath: string; fileName: string } {
    ensureTempDir();
    pruneExpiredFiles();

    const normalizedFileName = sanitizeFileName(fileName);
    const uniquePrefix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const targetPath = path.join(TEMP_DOC_DIR, `${uniquePrefix}-${normalizedFileName}`);
    const content = Buffer.from(normalizeBase64Docx(base64Docx), 'base64');

    fs.writeFileSync(targetPath, content);

    return {
        filePath: targetPath,
        fileName: path.basename(targetPath),
    };
}
