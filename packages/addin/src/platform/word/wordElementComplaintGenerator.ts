/* global Word */

function normalizeBase64Docx(base64Docx: string): string {
    const trimmed = base64Docx.trim();
    const prefixMatch = trimmed.match(/^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,/i);
    return prefixMatch ? trimmed.slice(prefixMatch[0].length) : trimmed;
}

export function createWordGeneratedDocxOpener() {
    return {
        async openGeneratedDocx(
            base64Docx: string,
            fileName?: string,
        ): Promise<void> {
            const normalized = normalizeBase64Docx(base64Docx);
            if (!normalized) {
                throw new Error('Generated docx payload is empty');
            }

            await Word.run(async (context) => {
                const newDoc = context.application.createDocument(normalized);
                await context.sync();
                newDoc.open();
                await context.sync();
            });

            if (fileName) {
                console.log('[WordAdapter] opened generated docx:', fileName);
            }
        },
    };
}
