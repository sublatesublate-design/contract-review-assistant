import type { ICommentManager, PlatformRange } from '../types';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsCommentManager implements ICommentManager {
    public async addComment(range: PlatformRange, commentText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument;

        const info = range._internal as { start: number, end: number };
        const r = doc.Content;
        r.Start = info.start;
        r.End = info.end;

        doc.Comments.Add(r, commentText);
    }

    public async addBatchComments(comments: Array<{ range: PlatformRange; text: string }>): Promise<void> {
        for (const c of comments) {
            await this.addComment(c.range, c.text);
        }
    }

    public async removeComment(range: PlatformRange, commentText: string): Promise<void> {
        if (!window.wps || range._platform !== 'wps') return;
        const app = window.wps.WpsApplication();
        const doc = app.ActiveDocument as any;

        const info = range._internal as { start: number, end: number };

        // 最快策略：缩小到目标 Range，直接读该 Range 上的注释集合，避免遍历全文档
        try {
            // 先尝试在精确范围内查找注释（WPS 支持 Range.Comments 属性）
            const r = doc.Range(info.start, info.end);
            const rangeComments = r.Comments;
            if (rangeComments && rangeComments.Count > 0) {
                // 只需检查精确范围内的少量注释
                for (let i = rangeComments.Count; i >= 1; i--) {
                    const comment = rangeComments.Item(i);
                    if (comment) {
                        comment.Delete();
                        return; // 找到并删除第一个即可
                    }
                }
            }
        } catch {
            // Range.Comments 不支持时，降级到全文注释查找
        }

        // 降级策略：遍历全文档注释，但只通过锚点位置匹配（不读文本内容）
        try {
            const comments = doc.Comments as any;
            if (!comments || comments.Count === 0) return;

            for (let i = comments.Count; i >= 1; i--) {
                const comment = comments.Item(i);
                if (!comment) continue;
                // 通过 Scope（批注锚点范围）的位置判断，不读 Range.Text 内容
                const scope = comment.Scope;
                if (scope) {
                    const s = scope.Start as number;
                    const e = scope.End as number;
                    // 锚点与目标范围有交集
                    if (s <= info.end && e >= info.start) {
                        comment.Delete();
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('[WPS removeComment] failed:', e);
        }
    }
}
