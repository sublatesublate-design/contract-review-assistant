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
 * 策略（保守版本，防止误扩展）：
 * 1. 在文档中精确定位 originalText
 * 2. 取后续文本（上限为 originalText 长度的 1.5 倍）
 * 3. 仅当重叠 ≥30 字符 且 ≥suggestedText 的 15% 时才扩展
 */
export function ensureNoOverlap(
    issue: ReviewIssue,
    docText: string
): ReviewIssue {
    const ot = issue.originalText?.trim();
    const st = issue.suggestedText?.trim();
    if (!ot || !st) return issue;
    if (st.length <= ot.length) return issue;

    const rawOtIdx = docText.indexOf(ot);
    if (rawOtIdx === -1) return issue;

    const rawAfterStart = rawOtIdx + ot.length;
    const maxExtension = Math.floor(ot.length * 1.5);
    const trailingDoc = docText.slice(rawAfterStart, rawAfterStart + maxExtension);
    if (!trailingDoc || trailingDoc.length < 30) return issue;

    const norm = (t: string) => t.replace(/[\s\u200b\u200c\u200d\ufeff]/g, '');
    const normTrailing = norm(trailingDoc);
    const normSt = norm(st);
    if (normTrailing.length < 30) return issue;

    // 长探针快速过滤（30 字符）
    const probeLen = Math.min(30, normTrailing.length);
    const probe = normTrailing.slice(0, probeLen);
    if (!normSt.endsWith(probe) && normSt.indexOf(probe) === -1) {
        return issue;
    }

    // 精确查找最长重叠
    const minOverlap = Math.max(30, Math.floor(normSt.length * 0.15));
    let bestOverlapLen = 0;
    for (let len = Math.min(normTrailing.length, normSt.length); len >= minOverlap; len--) {
        if (normSt.endsWith(normTrailing.slice(0, len))) {
            bestOverlapLen = len;
            break;
        }
    }
    if (bestOverlapLen < minOverlap) return issue;

    // 映射回原始文档偏移
    let rawExtendLen = 0;
    let normCount = 0;
    for (let i = rawAfterStart; i < docText.length && normCount < bestOverlapLen; i++) {
        rawExtendLen++;
        const ch = docText[i];
        if (ch && !/[\s\u200b\u200c\u200d\ufeff]/.test(ch)) normCount++;
    }
    if (rawExtendLen === 0 || rawExtendLen > maxExtension) return issue;

    const extension = docText.slice(rawAfterStart, rawAfterStart + rawExtendLen);
    console.log(`[issuePostProcess] 消除重叠：扩展 ${rawExtendLen} 字符`);
    return { ...issue, originalText: ot + extension };
}
