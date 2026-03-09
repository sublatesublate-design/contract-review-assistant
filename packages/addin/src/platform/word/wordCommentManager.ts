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

                // 性能优化：将关闭修订、插入批注、恢复修订三步合入同一批次
                // Office.js 代理队列保证同批次内操作按顺序执行
                doc.changeTrackingMode = Word.ChangeTrackingMode.off;
                wordRange.insertComment(commentText);
                doc.changeTrackingMode = originalMode;
                await context.sync();
            });
        },

        async removeComment(range: PlatformRange, commentText: string): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error('无法定位到文档中的原文');

                const normalize = (t: string) => t.replace(/\s+/g, '');
                const normTarget = normalize(commentText);
                let deleted = false;

                // 策略 1：在精确范围上搜索批注
                try {
                    const comments = wordRange.getComments();
                    context.load(comments, 'items/content');
                    await context.sync();

                    for (let i = 0; i < comments.items.length; i++) {
                        const comment = comments.items[i];
                        if (comment && comment.content && normalize(comment.content).includes(normTarget)) {
                            comment.delete();
                            deleted = true;
                            break;
                        }
                    }
                } catch { /* getComments API 不可用，继续全文档搜索 */ }

                // 策略 2：全文档批注搜索（范围偏移或 API 不支持时的兜底）
                if (!deleted) {
                    try {
                        const comments = context.document.body.getComments();
                        context.load(comments, 'items/content');
                        await context.sync();

                        for (let i = 0; i < comments.items.length; i++) {
                            const comment = comments.items[i];
                            if (comment && comment.content && normalize(comment.content).includes(normTarget)) {
                                comment.delete();
                                break;
                            }
                        }
                    } catch { /* 全文档搜索也失败 */ }
                }

                await context.sync();
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
