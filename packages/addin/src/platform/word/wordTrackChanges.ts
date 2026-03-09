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

            // 归一化函数：移除空白和标点，用于修订文本匹配
            const normalize = (t: string) =>
                t.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '');

            /**
             * 在修订集合中精确匹配并拒绝与 originalText/suggestedText 相关的修订。
             * @returns true 如果至少匹配并拒绝了一条修订
             */
            const rejectMatching = async (
                context: Word.RequestContext,
                revisionItems: Word.Revision[]
            ): Promise<boolean> => {
                if (revisionItems.length === 0) return false;

                // 加载每条修订的类型和关联范围的文本
                for (const rev of revisionItems) {
                    (rev as any).load('type');
                    const revRange = (rev as any).range;
                    if (revRange) {
                        revRange.load('text');
                    }
                }
                await context.sync();

                const normOrig = normalize(originalText);
                const normSugg = suggestedText ? normalize(suggestedText) : '';
                let matched = false;

                // 倒序遍历防止索引漂移
                for (let i = revisionItems.length - 1; i >= 0; i--) {
                    const rev = revisionItems[i];
                    if (!rev) continue;

                    let revText = '';
                    try {
                        revText = (rev as any).range.text || '';
                    } catch {
                        continue;
                    }
                    const revNorm = normalize(revText);
                    const revType = String((rev as any).type);
                    const isDeletion = revType === 'Delete' || revType === Word.RevisionType.delete;
                    const isInsertion = revType === 'Insert' || revType === Word.RevisionType.insert;

                    // 安全匹配逻辑：
                    // 1. 如果规范化后的文本相同，直接算匹配
                    // 2. 如果互为子串，要求被包含的字符串不能太短（避免如单字或空字符串带来的全匹配）
                    const isSafeMatch = (target: string, partial: string) => {
                        if (!target && !partial) return true; // 都为空（例如只有一些标点/换行）
                        if (!target || !partial) return false;
                        if (target === partial) return true;

                        // 互为子串，且被包含的较短部分至少为 2 个字符（容忍中文短词/编号如“附件”）
                        if (partial.length >= 2 && target.includes(partial)) return true;
                        if (target.length >= 2 && partial.includes(target)) return true;
                        return false;
                    };

                    // 对于只有空白/回车/标点符号的修订（revNorm为空），必须基于原始文本来判断是否匹配
                    // 这里我们放宽限制：如果当前正在处理该条款的修订，且它附近的这种空白修订，我们通过严格的全文包含判断
                    // 但更好的办法是：如果 revNorm 没有实质文字，而它又在我们的 searchRange（本来就是精准段落）中，
                    // 且它所在的类型（插入/删除）和我们正寻找的类型匹配，我们则视为匹配。
                    // 考虑到 searchRange 已经比较精准，这里如果 revNorm 为空，我们可以放行。

                    if (isDeletion && normOrig) {
                        if (revNorm === '' || isSafeMatch(normOrig, revNorm)) {
                            rev.reject();
                            matched = true;
                        }
                    } else if (isInsertion && normSugg) {
                        if (revNorm === '' || isSafeMatch(normSugg, revNorm)) {
                            rev.reject();
                            matched = true;
                        }
                    }
                }

                if (matched) {
                    await context.sync();
                }
                return matched;
            };

            let rejectedViaRevisions = false;
            try {
                rejectedViaRevisions = await Word.run(async (context) => {
                    const wordRange = await resolveWordRange(context, ref);
                    if (!wordRange) return false;

                    // ── 第 1 步：仅在当前段落范围内搜索修订（不侵入前后段落） ──
                    let searchRange = wordRange;
                    try {
                        const firstPara = wordRange.paragraphs.getFirst();
                        const lastPara = wordRange.paragraphs.getLast();
                        searchRange = firstPara.getRange().expandTo(lastPara.getRange());
                    } catch {
                        searchRange = wordRange;
                    }

                    const revisions = searchRange.revisions;
                    revisions.load('items');
                    await context.sync();

                    if (revisions.items.length > 0) {
                        // 当前段落有修订，尝试精确匹配
                        const matched = await rejectMatching(context, revisions.items);
                        if (matched) return true;

                        // 精确匹配失败，兜底：仅对当前段落范围 rejectAll（不扩展前后段落）
                        searchRange.revisions.rejectAll();
                        await context.sync();
                        return true;
                    }

                    // ── 第 2 步：当前段落无修订，谨慎扩展到前后各一个段落 ──
                    try {
                        const firstPara = wordRange.paragraphs.getFirst();
                        const lastPara = wordRange.paragraphs.getLast();
                        const prevPara = firstPara.getPreviousOrNullObject();
                        const nextPara = lastPara.getNextOrNullObject();
                        prevPara.load('isNullObject');
                        nextPara.load('isNullObject');
                        await context.sync();

                        const expandStart = prevPara.isNullObject ? firstPara.getRange() : prevPara.getRange();
                        const expandEnd = nextPara.isNullObject ? lastPara.getRange() : nextPara.getRange();
                        const expandedRange = expandStart.expandTo(expandEnd);

                        const expandedRevisions = expandedRange.revisions;
                        expandedRevisions.load('items');
                        await context.sync();

                        // 扩展后必须精确匹配，绝不能 rejectAll（避免误杀邻近条款修订）
                        const matched = await rejectMatching(context, expandedRevisions.items);
                        if (matched) return true;
                    } catch { /* 扩展失败 */ }

                    return false;
                });
            } catch {
                rejectedViaRevisions = false;
            }

            if (!rejectedViaRevisions) {
                throw new Error('无法自动取消修订，请手动在 Word 中拒绝此修订');
            }
        },
    };
}
