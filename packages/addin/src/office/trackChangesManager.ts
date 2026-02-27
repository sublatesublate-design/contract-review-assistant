/* global Word */

/**
 * trackChangesManager.ts
 * 生成修订标记：开启 trackAll 后，insertText(replace) 自动生成
 * 原文显示为删除线（红色），新文本显示为下划线（蓝色），用户可逐条接受/拒绝
 */

export const trackChangesManager = {
    /**
     * 将 AI 建议的修改应用为修订标记
     * @param context Word.RequestContext
     * @param range 要修改的原文 Range
     * @param suggestedText AI 建议的新文本
     */
    async applySuggestedEdit(
        context: Word.RequestContext,
        range: Word.Range,
        suggestedText: string
    ): Promise<void> {
        const doc = context.document;
        doc.load('changeTrackingMode');
        await context.sync();

        const originalMode = doc.changeTrackingMode;

        // 开启修订追踪模式
        doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        await context.sync();

        try {
            // 使用 insertText(replace) 生成修订标记
            // 原文将显示为删除线，新文本显示为下划线
            range.insertText(suggestedText, Word.InsertLocation.replace);
            await context.sync();
        } finally {
            // 恢复原始修订模式（不自动关闭，保持用户原有设置）
            doc.changeTrackingMode = originalMode;
            await context.sync();
        }
    },

    /**
     * 接受所有修订（谨慎使用）
     */
    async acceptAllRevisions(context: Word.RequestContext): Promise<void> {
        // Word JS API 1.4+ 暂不直接支持批量接受，通过设置模式实现
        // 实际项目中可通过 VBA Bridge 或 Office Scripts 实现
        console.warn('acceptAllRevisions: 请在 Word 中手动接受所有修订');
    },

    /**
     * 临时关闭修订追踪（用于批注等不需要追踪的操作，参见 commentManager）
     */
    async withTrackingOff<T>(
        context: Word.RequestContext,
        fn: () => Promise<T>
    ): Promise<T> {
        const doc = context.document;
        doc.load('changeTrackingMode');
        await context.sync();

        const originalMode = doc.changeTrackingMode;
        doc.changeTrackingMode = Word.ChangeTrackingMode.off;
        await context.sync();

        try {
            return await fn();
        } finally {
            doc.changeTrackingMode = originalMode;
            await context.sync();
        }
    },
};
