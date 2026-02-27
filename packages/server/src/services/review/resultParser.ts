import type { ReviewIssue } from '../../types/review';

/**
 * resultParser.ts
 * 解析 AI 流式输出的 JSON 行为 ReviewIssue[]
 */

export interface ReviewIssueRaw {
    type: 'issue';
    id: string;
    category: ReviewIssue['category'];
    riskLevel: ReviewIssue['riskLevel'];
    title: string;
    description: string;
    originalText: string;
    suggestedText?: string;
    legalBasis?: string;
}

export interface SummaryRaw {
    type: 'summary';
    content: string;
    model: string;
}

export type ParsedAILine = ReviewIssueRaw | SummaryRaw | null;

/**
 * 解析 AI 输出的单行 JSON
 * AI 每发现一个问题就输出一行 JSON（行流式）
 */
export function parseLine(line: string): ParsedAILine {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) return null;

    try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (obj['type'] === 'issue') {
            return obj as unknown as ReviewIssueRaw;
        }
        if (obj['type'] === 'summary') {
            return obj as unknown as SummaryRaw;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * 将 AI 原始 issue 数据转为规范 ReviewIssue
 */
export function toReviewIssue(raw: ReviewIssueRaw): ReviewIssue {
    return {
        id: raw.id || `issue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        category: raw.category,
        riskLevel: raw.riskLevel,
        title: raw.title,
        description: raw.description,
        originalText: raw.originalText,
        ...(raw.suggestedText ? { suggestedText: raw.suggestedText } : {}),
        ...(raw.legalBasis ? { legalBasis: raw.legalBasis } : {}),
        status: 'pending',
    };
}
