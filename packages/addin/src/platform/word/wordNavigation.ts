/* global Word */

import type { INavigationHelper, PlatformRange } from '../types';
import { resolveWordRange, type WordRangeRef } from './wordRangeMapper';

export function createWordNavigationHelper(): INavigationHelper {
    return {
        async navigateToRange(range: PlatformRange): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) return;
                wordRange.select(Word.SelectionMode.select);
                await context.sync();
            });
        },

        async highlightRange(range: PlatformRange, color: string = '#FFFF00'): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) return;
                wordRange.font.highlightColor = color;
                await context.sync();
            });
        },

        async clearHighlight(range: PlatformRange): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) return;
                wordRange.font.highlightColor = 'None';
                await context.sync();
            });
        },

        async navigateAndHighlight(range: PlatformRange): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) return;
                wordRange.select(Word.SelectionMode.select);
                wordRange.font.highlightColor = '#FFF9C4';
                await context.sync();
            });

            // 2 秒后自动取消高亮
            setTimeout(async () => {
                try {
                    await Word.run(async (ctx) => {
                        const selection = ctx.document.getSelection();
                        selection.font.highlightColor = 'None';
                        await ctx.sync();
                    });
                } catch { /* 忽略 */ }
            }, 2000);
        },
    };
}
