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
        const app = window.wps.WpsApplication();
        const paragraphs = app.ActiveDocument.Paragraphs;
        const count = paragraphs.Count;
        const sections: DocumentSection[] = [];

        for (let i = 1; i <= count; i++) {
            const text = paragraphs.Item(i).Range.Text;
            if (text && text.trim().length > 0) {
                sections.push({
                    type: 'paragraph',
                    text: text.trim(),
                    index: i - 1
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
