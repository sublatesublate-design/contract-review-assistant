/* global Word */

import type { IDocumentReader, DocumentSection } from '../types';

export function createWordDocumentReader(): IDocumentReader {
    return {
        async readFullText(): Promise<string> {
            return Word.run(async (context) => {
                const body = context.document.body;
                body.load('text');
                await context.sync();
                return body.text;
            });
        },

        async readParagraphs(): Promise<DocumentSection[]> {
            return Word.run(async (context) => {
                const paragraphs = context.document.body.paragraphs;
                paragraphs.load('items/text');
                await context.sync();
                return paragraphs.items.map((para, index) => ({
                    type: 'paragraph' as const,
                    text: para.text,
                    index,
                }));
            });
        },

        async readStructured(): Promise<DocumentSection[]> {
            return Word.run(async (context) => {
                const body = context.document.body;
                const paragraphs = body.paragraphs;
                const tables = body.tables;
                paragraphs.load('items/text');
                tables.load('items/values');
                await context.sync();

                const sections: DocumentSection[] = [];
                paragraphs.items.forEach((para, index) => {
                    if (para.text.trim()) {
                        sections.push({ type: 'paragraph', text: para.text.trim(), index });
                    }
                });
                tables.items.forEach((table, index) => {
                    const tableText = table.values
                        .map((row) => row.filter(Boolean).join(' | '))
                        .filter((row) => row.trim())
                        .join('\n');
                    if (tableText) {
                        sections.push({ type: 'table', text: tableText, index });
                    }
                });
                return sections;
            });
        },

        async getWordCount(): Promise<number> {
            return Word.run(async (context) => {
                const body = context.document.body;
                body.load('text');
                await context.sync();
                return body.text.replace(/\s+/g, '').length;
            });
        },

        async readSelection(): Promise<string | null> {
            return Word.run(async (context) => {
                const selection = context.document.getSelection();
                selection.load('text');
                await context.sync();
                const text = selection.text?.trim() ?? '';
                return text.length > 0 ? text : null;
            });
        },
    };
}
