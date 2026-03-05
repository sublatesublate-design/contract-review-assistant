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
                // select() 会自动将视图滚动到选中位置（Win/Mac 均有效）
                wordRange.select(Word.SelectionMode.select);
                await context.sync();
            });
        },

        async highlightRange(range: PlatformRange, _color?: string): Promise<void> {
            // 改为原生选中，不再使用 highlightColor（取消麻烦且颜色停留）
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) return;
                wordRange.select(Word.SelectionMode.select);
                await context.sync();
            });
        },

        async clearHighlight(_range: PlatformRange): Promise<void> {
            // 改为原生选中方式后，clearHighlight 不再需要操作，用户点击即取消
        },

        async navigateAndHighlight(range: PlatformRange): Promise<void> {
            // 直接选中跳转即可，原生选中高亮用户点击其他地方自然消失
            const ref = range._internal as WordRangeRef;
            await Word.run(async (context) => {
                const wordRange = await resolveWordRange(context, ref);
                if (!wordRange) throw new Error("无法在文档中定位原文");
                wordRange.select(Word.SelectionMode.select);
                await context.sync();
            });
        },
    };
}
