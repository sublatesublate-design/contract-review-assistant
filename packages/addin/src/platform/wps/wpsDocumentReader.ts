import type { IDocumentReader, DocumentSection } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsDocumentReader implements IDocumentReader {
    private normalizeTableCellText(text: string | undefined): string {
        return (text || '')
            .replace(/\r\x07/g, ' ')
            .replace(/\x07/g, ' ')
            .replace(/\r/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private readTables(): DocumentSection[] {
        if (!window.wps) throw new Error('WPS JSAPI not available');

        const tables = window.wps.WpsApplication().ActiveDocument.Tables;
        const sections: DocumentSection[] = [];

        for (let tableIndex = 1; tableIndex <= tables.Count; tableIndex += 1) {
            const table = tables.Item(tableIndex);
            const rowCount = table.Rows.Count;
            const columnCount = table.Columns.Count;
            const rows: string[] = [];

            for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
                const cells: string[] = [];

                for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
                    const cellText = this.normalizeTableCellText(table.Cell(rowIndex, columnIndex).Range.Text);
                    if (cellText) {
                        cells.push(cellText);
                    }
                }

                if (cells.length > 0) {
                    rows.push(cells.join(' | '));
                }
            }

            if (rows.length > 0) {
                sections.push({
                    type: 'table',
                    text: rows.join('\n'),
                    index: tableIndex - 1,
                });
            }
        }

        return sections;
    }

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
        const sections = await this.readParagraphs();

        try {
            sections.push(...this.readTables());
        } catch (error) {
            console.warn('[WPS readStructured] failed to read tables:', error);
        }

        return sections;
    }

    public async getWordCount(): Promise<number> {
        const text = await this.readFullText();
        return text.replace(/\s+/g, '').length;
    }

    public async readSelection(): Promise<string | null> {
        if (!window.wps) return null;
        const app = window.wps.WpsApplication();
        const text = app.Selection.Text;
        return text || null;
    }
}
