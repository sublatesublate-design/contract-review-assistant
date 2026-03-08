import type { ReviewIssue } from '../types/review';

/** 中文句子结束标点 */
const SENTENCE_END = /[。；？！\n]/;

/**
 * 将 AI 的 originalText 扩展到文档中最近的句子边界
 *
 * 解决的问题：AI 引用原文时经常不含尾部句号/分号，
 * 导致 Word 选中的范围不是完整句子，替换后会残留文字。
 *
 * 策略：
 * 1. 检查 originalText 是否已以句子结束标点结尾 → 无需扩展
 * 2. 在文档全文中定位 originalText
 * 3. 从匹配结束位置向后查找最近的句子结束标点（最多扩展 50 字符）
 * 4. 将 originalText 扩展到该标点（含）
 * 5. 如果 suggestedText 不以同类标点结尾，自动补上终止标点
 */
export function ensureSentenceBoundary(
    issue: ReviewIssue,
    docText: string
): ReviewIssue {
    const ot = issue.originalText?.trim();
    if (!ot) return issue;

    // 已经以句子结束标点结尾，无需扩展
    if (SENTENCE_END.test(ot[ot.length - 1] || '')) return issue;

    // 在文档原始全文中查找
    const rawIdx = docText.indexOf(ot);
    if (rawIdx === -1) {
        // 试试归一化匹配（去零宽字符）
        const normDoc = docText.replace(/[\u200b\u200c\u200d\ufeff]/g, '');
        const normOt = ot.replace(/[\u200b\u200c\u200d\ufeff]/g, '');
        const normIdx = normDoc.indexOf(normOt);
        if (normIdx === -1) return issue;

        return extendAtIndex(issue, normDoc, normOt, normIdx);
    }

    return extendAtIndex(issue, docText, ot, rawIdx);
}

function extendAtIndex(
    issue: ReviewIssue,
    doc: string,
    ot: string,
    idx: number
): ReviewIssue {
    const afterStart = idx + ot.length;
    const afterSlice = doc.slice(afterStart, afterStart + 50);
    const endMatch = afterSlice.match(SENTENCE_END);

    if (!endMatch || endMatch.index === undefined) return issue;

    const rawExtension = afterSlice.slice(0, endMatch.index + 1);
    const extendedOriginal = ot + rawExtension;
    const endPunct = extendedOriginal[extendedOriginal.length - 1];

    console.log(
        `[issuePostProcess] 扩展 originalText: "...${ot.slice(-10)}" → "+${rawExtension}"`,
    );

    const result: ReviewIssue = {
        ...issue,
        originalText: extendedOriginal,
    };

    // 确保 suggestedText 以正确的句子结束标点结尾
    if (issue.suggestedText != null) {
        const trimmed = issue.suggestedText.trim();
        if (trimmed && !SENTENCE_END.test(trimmed[trimmed.length - 1] || '')) {
            result.suggestedText = trimmed + endPunct;
        } else {
            result.suggestedText = issue.suggestedText;
        }
    }

    return result;
}

/**
 * 检测并消除 suggestedText 与文档后续文本的重叠
 *
 * 解决的问题：AI 返回的 suggestedText 是整个条款的完整重写版本，
 * 但 originalText 只覆盖条款的一部分。替换后，未被 originalText 覆盖的
 * 原文仍然保留在文档中，导致条款内容重复。
 *
 * 策略：
 * 1. 在文档中定位 originalText
 * 2. 取 originalText 之后的文档文本（最多 2000 字符）
 * 3. 取 suggestedText 的尾部，检查是否与文档后续文本存在重叠
 * 4. 如果存在重叠，将 originalText 向后扩展以覆盖重叠区域
 */
export function ensureNoOverlap(
    issue: ReviewIssue,
    docText: string
): ReviewIssue {
    const ot = issue.originalText?.trim();
    const st = issue.suggestedText?.trim();
    if (!ot || !st) return issue;

    // suggestedText 必须比 originalText 长才可能产生「尾部溢出」重叠
    if (st.length <= ot.length) return issue;

    // 归一化函数：移除空白和零宽字符，便于模糊匹配
    const norm = (t: string) => t.replace(/[\s\u200b\u200c\u200d\ufeff]/g, '');

    // 在文档中定位 originalText
    const normDoc = norm(docText);
    const normOt = norm(ot);
    const otIdx = normDoc.indexOf(normOt);
    if (otIdx === -1) return issue;

    // 取 originalText 结束位置之后的文档文本（归一化后）
    const afterOtStart = otIdx + normOt.length;
    const trailingDoc = normDoc.slice(afterOtStart, afterOtStart + 2000);
    if (!trailingDoc) return issue;

    // 取 suggestedText 中超出 originalText 部分的尾部
    const normSt = norm(st);

    // 贪心查找：suggestedText 的尾部与 trailingDoc 的最长前缀匹配
    // 即查找 suggestedText 末尾有多少内容与文档后续文本重叠
    let bestOverlapLen = 0;

    // 从 suggestedText 末尾逐步试探，找到与 trailingDoc 开头匹配的最长片段
    // 优化：先用短探针快速判断是否存在任何重叠
    const probeLen = Math.min(15, normSt.length, trailingDoc.length);
    const probe = trailingDoc.slice(0, probeLen);
    if (normSt.indexOf(probe) === -1) {
        // 文档后续文本的开头 15 字不在 suggestedText 中，不存在重叠
        return issue;
    }

    // 存在潜在重叠，精确查找最长重叠
    for (let len = Math.min(trailingDoc.length, normSt.length); len >= probeLen; len--) {
        const trailingSlice = trailingDoc.slice(0, len);
        if (normSt.endsWith(trailingSlice)) {
            bestOverlapLen = len;
            break;
        }
    }

    if (bestOverlapLen < 8) return issue; // 重叠太短，可能是误匹配

    // 将重叠长度映射回原始文档的字符偏移
    // 在原始 docText 中找到 originalText 的结束位置
    const rawOtIdx = docText.indexOf(ot);
    if (rawOtIdx === -1) return issue;

    const rawAfterStart = rawOtIdx + ot.length;

    // 从原始文档的 afterStart 位置开始，逐字符消费直到归一化后的长度达到 bestOverlapLen
    let rawExtendLen = 0;
    let normCount = 0;
    for (let i = rawAfterStart; i < docText.length && normCount < bestOverlapLen; i++) {
        rawExtendLen++;
        const ch = docText[i];
        if (ch && !/[\s\u200b\u200c\u200d\ufeff]/.test(ch)) {
            normCount++;
        }
    }

    if (rawExtendLen === 0) return issue;

    const extension = docText.slice(rawAfterStart, rawAfterStart + rawExtendLen);
    const extendedOriginal = ot + extension;

    console.log(
        `[issuePostProcess] 消除重叠：originalText 向后扩展 ${rawExtendLen} 字符，覆盖 suggestedText 尾部重叠区域`,
        `\n  原始长度: ${ot.length} → 扩展后: ${extendedOriginal.length}`,
        `\n  扩展内容: "...${extension.slice(0, 60)}${extension.length > 60 ? '...' : ''}"`,
    );

    return {
        ...issue,
        originalText: extendedOriginal,
    };
}
