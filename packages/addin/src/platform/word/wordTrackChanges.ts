/* global Word */

import type { ITrackChangesManager, PlatformRange } from '../types';
import { resolveWordRange, type WordRangeRef } from './wordRangeMapper';

export function createWordTrackChangesManager(): ITrackChangesManager {
    return {
        async applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error('无法定位到文档中的原文');

                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                await context.sync();

                try {
                    wordRange.insertText(suggestedText, Word.InsertLocation.replace);
                    await context.sync();
                } finally {
                    doc.changeTrackingMode = originalMode;
                    await context.sync();
                }
            });
        },

        async revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void> {
            const ref = range._internal as WordRangeRef;

            // 策略 1：使用 Revision API 逐个拒绝（Windows/Mac 均支持，需 WordApi 1.3+）
            // 在目标渲染区域前后各扩展 500 字符以捕获相邻的被删除原文和被插入新文本
            let rejectedViaRevisions = false;
            try {
                rejectedViaRevisions = await Word.run(async (context) => {
                    // 先定位到目标区域
                    const wordRange = await resolveWordRange(context, ref);
                    if (!wordRange) return false;

                    // 通过 expandTo 扩展搜索范围，覆盖相邻的修订标记
                    // 注意：office.js 的 getSpellCheckedRange 等 API 不全可用，
                    // 改为直接获取 document.revisions 并按文本过滤
                    const revisions = context.document.body.getRange().revisions;
                    revisions.load('items');
                    await context.sync();

                    const orig = originalText.replace(/\s+/g, '');
                    const sugg = (suggestedText || '').replace(/\s+/g, '');

                    let rejectedCount = 0;
                    for (const rev of revisions.items) {
                        try {
                            rev.range.load('text');
                            await context.sync();
                            const revText = (rev.range.text || '').replace(/\s+/g, '');

                            if (revText && (
                                orig.includes(revText) ||
                                sugg.includes(revText) ||
                                revText.includes(orig) ||
                                revText.includes(sugg)
                            )) {
                                rev.reject();
                                rejectedCount++;
                            }
                        } catch { /* 单条修订处理失败，继续 */ }
                    }

                    if (rejectedCount > 0) {
                        await context.sync();
                        return true;
                    }
                    return false;
                });
            } catch {
                // WordApi.Revision 不可用（旧版 Word / 某些 Mac 版本），降级到策略 2
                rejectedViaRevisions = false;
            }

            // 策略 2（兜底）：关闭修订模式，直接无痕替换回原文
            if (!rejectedViaRevisions) {
                await Word.run(async (context) => {
                    let wordRange = await resolveWordRange(context, ref);

                    // 如果按 originalText 找不到，尝试按 suggestedText 查找
                    if (!wordRange && suggestedText) {
                        wordRange = await resolveWordRange(context, { searchText: suggestedText });
                    }

                    if (!wordRange) throw new Error('无法定位到文档中的原文或修改后的文本');

                    const doc = context.document;
                    doc.load('changeTrackingMode');
                    await context.sync();
                    const originalMode = doc.changeTrackingMode;

                    try {
                        doc.changeTrackingMode = Word.ChangeTrackingMode.off;
                        await context.sync();
                        wordRange.insertText(originalText, Word.InsertLocation.replace);
                        await context.sync();
                    } finally {
                        doc.changeTrackingMode = originalMode;
                        await context.sync();
                    }
                });
            }
        },
    };
}
