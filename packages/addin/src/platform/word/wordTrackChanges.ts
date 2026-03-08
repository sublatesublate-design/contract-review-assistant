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

                // 性能优化：将开启修订、替换文本、恢复修订三步合入同一批次
                doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                wordRange.insertText(suggestedText, Word.InsertLocation.replace);
                doc.changeTrackingMode = originalMode;
                await context.sync();
            });
        },

        async insertAfterRange(range: PlatformRange, suggestedText: string): Promise<void> {
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error('无法定位到文档中的插入锚点');

                const doc = context.document;
                doc.load('changeTrackingMode');
                await context.sync();
                const originalMode = doc.changeTrackingMode;

                // 性能优化：将开启修订、插入文本、恢复修订三步合入同一批次
                doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                wordRange.insertText('\n' + suggestedText, Word.InsertLocation.after);
                doc.changeTrackingMode = originalMode;
                await context.sync();
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

                    // 将搜索范围向前后大幅扩展，以确保包含因为替换而产生的邻近的"删除修订"(Deletion Revision)
                    // (原先只用当前段落，可能会漏掉跨段删除或由于替换导致段落边界变动而被落下的删除痕迹)
                    let searchRange = wordRange;
                    try {
                        const firstPara = wordRange.paragraphs.getFirst();
                        const lastPara = wordRange.paragraphs.getLast();

                        // 尝试获取前后各一个段落以扩大范围
                        const prevPara = firstPara.getPreviousOrNullObject();
                        const nextPara = lastPara.getNextOrNullObject();
                        // 必须加载 nullObject 状态以便后续判断
                        prevPara.load('isNullObject');
                        nextPara.load('isNullObject');
                        await context.sync();

                        const expandStart = prevPara.isNullObject ? firstPara.getRange() : prevPara.getRange();
                        const expandEnd = nextPara.isNullObject ? lastPara.getRange() : nextPara.getRange();
                        searchRange = expandStart.expandTo(expandEnd);
                    } catch (e) {
                        // 失败时的兜底策略
                        searchRange = wordRange.paragraphs.getFirst().getRange().expandTo(wordRange.paragraphs.getLast().getRange());
                    }

                    const revisions = searchRange.revisions;
                    revisions.load('items');
                    await context.sync();

                    // 第一步：先将所有的 rev.range 全部 load('text')
                    for (const rev of revisions.items) {
                        rev.range.load('text');
                    }
                    await context.sync();

                    const orig = originalText.replace(/\s+/g, '');
                    const sugg = (suggestedText || '').replace(/\s+/g, '');

                    let rejectedCount = 0;
                    // 第二步：由于 .reject() 会改变文档，进而可能立即使后续未处理的修订节点产生无效的对象引用 (InvalidObjectPath)
                    // 所以必须：在所有 text 完成 load 并且脱离 sync 后，再从后往前(倒序)来判断并执行 reject
                    for (let i = revisions.items.length - 1; i >= 0; i--) {
                        const rev = revisions.items[i];
                        if (!rev) continue;
                        try {
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
                        } catch (err) {
                            console.warn('[Word revertEdit] Reject single revision failed:', err);
                        }
                    }

                    if (rejectedCount > 0) {
                        await context.sync();
                        return true;
                    }
                    return false;
                });
            } catch {
                // WordApi.Revision 不可用（旧版 Word / 某些 Mac 版本），抛出异常让用户手动撤销
                rejectedViaRevisions = false;
            }

            if (!rejectedViaRevisions) {
                throw new Error('无法自动取消修订，请手动在 Word 中拒绝此修订');
            }
        },
    };
}
