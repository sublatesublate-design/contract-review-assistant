/* global Word */

import type { IClauseInserter } from '../types';

export function createWordClauseInserter(): IClauseInserter {
    return {
        async insertTextAtSelection(content: string): Promise<void> {
            await Word.run(async (context) => {
                const range = context.document.getSelection();
                range.insertText(content, Word.InsertLocation.replace);
                range.select();
                await context.sync();
            });
        },
    };
}
