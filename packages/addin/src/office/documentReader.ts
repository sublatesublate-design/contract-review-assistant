/* global Word */

/**
 * documentReader.ts
 * 封装 Office JS API，读取 Word 文档内容
 */

export interface DocumentSection {
    type: 'paragraph' | 'table';
    text: string;
    index: number;
}

export const documentReader = {
    /**
     * 读取文档全文（纯文字，用于传给 AI）
     */
    async readFullText(context: Word.RequestContext): Promise<string> {
        const body = context.document.body;
        body.load('text');
        await context.sync();
        return body.text;
    },

    /**
     * 读取文档所有段落（含段落索引，用于 rangeMapper 回退定位）
     */
    async readParagraphs(context: Word.RequestContext): Promise<DocumentSection[]> {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items/text');
        await context.sync();

        return paragraphs.items.map((para, index) => ({
            type: 'paragraph' as const,
            text: para.text,
            index,
        }));
    },

    /**
     * 读取文档结构：段落 + 表格（更完整的文档内容）
     */
    async readStructured(context: Word.RequestContext): Promise<DocumentSection[]> {
        const body = context.document.body;
        const paragraphs = body.paragraphs;
        const tables = body.tables;

        paragraphs.load('items/text');
        tables.load('items/values');
        await context.sync();

        const sections: DocumentSection[] = [];

        // 段落
        paragraphs.items.forEach((para, index) => {
            if (para.text.trim()) {
                sections.push({ type: 'paragraph', text: para.text.trim(), index });
            }
        });

        // 表格（转为文字）
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
    },

    /**
     * 获取文档字数（用于 UI 显示）
     */
    async getWordCount(context: Word.RequestContext): Promise<number> {
        const body = context.document.body;
        body.load('text');
        await context.sync();
        return body.text.replace(/\s+/g, '').length;
    },

    /**
     * 读取当前选中文本（用于局部审查）
     * 返回 null 表示选区为空或无法读取
     */
    async readSelection(context: Word.RequestContext): Promise<string | null> {
        const selection = context.document.getSelection();
        selection.load('text');
        await context.sync();
        const text = selection.text?.trim() ?? '';
        return text.length > 0 ? text : null;
    },
};
