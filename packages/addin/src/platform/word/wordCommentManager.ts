/* global Word */

import type { ICommentManager, PlatformRange } from '../types';
import { resolveWordRange, type WordRangeRef } from './wordRangeMapper';

export function createWordCommentManager(): ICommentManager {
    return {
        async addComment(range: PlatformRange, commentText: string): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error('无法定位到文档中的原文');

                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                try {
                    doc.changeTrackingMode = Word.ChangeTrackingMode.off;
                    await context.sync();
                    wordRange.insertComment(commentText);
                    await context.sync();
                } finally {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                }
            });
        },

        async addBatchComments(comments: Array<{ range: PlatformRange; text: string }>): Promise<void> {
            await Word.run(async (context) => {
                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;
                doc.changeTrackingMode = Word.ChangeTrackingMode.off;
                await context.sync();

                try {
                    for (const { range, text } of comments) {
                        const ref = range._internal as WordRangeRef;
                        const wordRange = await resolveWordRange(context, ref);
                        if (wordRange) {
                            wordRange.insertComment(text);
                        }
                    }
                    await context.sync();
                } finally {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                }
            });
        },
    };
}
