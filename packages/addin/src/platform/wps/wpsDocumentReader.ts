import type { IDocumentReader, DocumentSection } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsDocumentReader implements IDocumentReader {
    public async readFullText(): Promise<string> {
        if (!window.wps) throw new Error('WPS JSAPI not available');
        const app = window.wps.WpsApplication();
        return app.ActiveDocument.Content.Text || '';
    }

    public async readParagraphs(): Promise<DocumentSection[]> {
        if (!window.wps) throw new Error('WPS JSAPI not available');

        // 性能关键优化：禁止逐个遍历 paragraphs.Item(i).Range.Text，这在大文档中是灾难性的。
        // 改为一次性读取全文并按 \r 拆分，这在大文档下快 10-100 倍。
        const fullText = await this.readFullText();
        if (!fullText) return [];

        const sections: DocumentSection[] = [];
        const lines = fullText.split(/\r/);

        for (let i = 0; i < lines.length; i++) {
            const text = lines[i];
            if (text === undefined) continue;
            const trimmed = text.trim();
            if (trimmed.length > 0) {
                sections.push({
                    type: 'paragraph',
                    text: trimmed,
                    index: i // 对应 0-based 索引，与原逻辑 i-1 保持一致
                });
            }
        }
        return sections;
    }

    public async readStructured(): Promise<DocumentSection[]> {
        // Simplified for WPS, identical to readParagraphs for now
        // Could be expanded to include tables as requested by the plan
        return this.readParagraphs();
    }

    public async getWordCount(): Promise<number> {
        const text = await this.readFullText();
        return text.trim().split(/\s+/).length;
    }

    public async readSelection(): Promise<string | null> {
        if (!window.wps) return null;
        const app = window.wps.WpsApplication();
        const text = app.Selection.Text;
        return text || null;
    }
}
