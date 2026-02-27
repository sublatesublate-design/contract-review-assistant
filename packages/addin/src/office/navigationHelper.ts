/* global Word */

/**
 * navigationHelper.ts
 * 在问题间导航：选中并高亮指定的 Range，将视图滚动到该位置
 */

export const navigationHelper = {
    /**
     * 选中并滚动到指定 Range（实现"定位"功能）
     */
    async navigateToRange(
        context: Word.RequestContext,
        range: Word.Range
    ): Promise<void> {
        // 选中 Range，Word 会自动滚动到该位置
        range.select(Word.SelectionMode.select);
        await context.sync();
    },

    /**
     * 高亮指定 Range（黄色高亮，用于标记当前活跃问题）
     */
    async highlightRange(
        context: Word.RequestContext,
        range: Word.Range,
        color: string = '#FFFF00'
    ): Promise<void> {
        range.font.highlightColor = color;
        await context.sync();
    },

    /**
     * 清除 Range 高亮
     */
    async clearHighlight(
        context: Word.RequestContext,
        range: Word.Range
    ): Promise<void> {
        range.font.highlightColor = 'None';
        await context.sync();
    },

    /**
     * 定位并临时高亮（2 秒后自动取消高亮）
     */
    async navigateAndHighlight(
        context: Word.RequestContext,
        range: Word.Range
    ): Promise<void> {
        range.select(Word.SelectionMode.select);
        range.font.highlightColor = '#FFF9C4';
        await context.sync();

        // 2 秒后自动取消高亮
        setTimeout(async () => {
            await Word.run(async (ctx) => {
                // 重新查找需要清除高亮的 range（原 range 已失效）
                // 此处通过当前选区来操作
                const selection = ctx.document.getSelection();
                selection.font.highlightColor = 'None';
                await ctx.sync();
            });
        }, 2000);
    },

    /**
     * 导航到当前文档中的第 N 个问题（通过 issue.id 实现问题间跳转）
     */
    async navigateToIssue(
        _context: Word.RequestContext,
        issueId: string
    ): Promise<void> {
        // 实际使用时从 reviewStore 查找 issue 的 originalText，再调用 rangeMapper.findRange
        console.log(`[navigationHelper] navigateToIssue: ${issueId}`);
    },
};
