/* global Word */

/**
 * commentManager.ts
 * 在 Word 文档中添加和管理批注
 *
 * 关键：插入批注前临时关闭修订追踪，避免批注操作本身被记录为修订
 */

export const commentManager = {
    /**
     * 在指定 Range 添加批注
     * @param context Word.RequestContext
     * @param range 要批注的 Range
     * @param commentText 批注内容
     */
    async addComment(
        context: Word.RequestContext,
        range: Word.Range,
        commentText: string
    ): Promise<void> {
        const doc = context.document;
        doc.load('changeTrackingMode');
        await context.sync();

        // 记录原始修订模式
        const originalMode = doc.changeTrackingMode;

        try {
            // 临时关闭修订追踪（批注操作不应被记录为修订）
            doc.changeTrackingMode = Word.ChangeTrackingMode.off;
            await context.sync();

            // 插入批注
            range.insertComment(commentText);
            await context.sync();
        } finally {
            // 恢复原始修订模式
            doc.changeTrackingMode = originalMode;
            await context.sync();
        }
    },

    /**
     * 批量添加批注（审查完成后一次性批注所有问题）
     */
    async addBatchComments(
        context: Word.RequestContext,
        comments: Array<{ range: Word.Range; text: string }>
    ): Promise<void> {
        const doc = context.document;
        doc.load('changeTrackingMode');
        await context.sync();

        const originalMode = doc.changeTrackingMode;
        doc.changeTrackingMode = Word.ChangeTrackingMode.off;
        await context.sync();

        try {
            for (const { range, text } of comments) {
                range.insertComment(text);
            }
            await context.sync();
        } finally {
            doc.changeTrackingMode = originalMode;
            await context.sync();
        }
    },
};
