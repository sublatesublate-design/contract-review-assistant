/**
 * platform/types.ts
 * 平台适配器接口定义
 * 统一 Office.js (Word) 和 WPS JSAPI 的文档操作接口
 */

import type { ReviewResult } from '../types/review';
import type { ContractSummary } from '../types/summary';

export type PlatformType = 'word' | 'wps' | 'unknown';

/** 文档结构段落 */
export interface DocumentSection {
    type: 'paragraph' | 'table';
    text: string;
    index: number;
}

/**
 * 不透明的 Range 句柄，由各平台适配器创建和使用
 * Office.js: 存储搜索文本 + 段落索引（因 Word.Range 不能跨 Word.run 存活）
 * WPS JSAPI: 存储 start/end 偏移量
 */
export interface PlatformRange {
    _internal: unknown;
    _platform: PlatformType;
}

/** 文档读取 */
export interface IDocumentReader {
    readFullText(): Promise<string>;
    readParagraphs(): Promise<DocumentSection[]>;
    readStructured(): Promise<DocumentSection[]>;
    getWordCount(): Promise<number>;
    readSelection(): Promise<string | null>;
}

/** 文本搜索 → Range 定位 */
export interface IRangeMapper {
    findRange(originalText: string): Promise<PlatformRange | null>;
    preloadFullText?(): Promise<void>;
    findRangeFromCache?(originalText: string): PlatformRange | null;
}

/** 批注管理 */
export interface ICommentManager {
    addComment(range: PlatformRange, commentText: string): Promise<void>;
    addBatchComments(comments: Array<{ range: PlatformRange; text: string }>): Promise<boolean[]>;
    removeComment(range: PlatformRange, commentText: string): Promise<void>;
}

/** 修订追踪 */
export interface ITrackChangesManager {
    applySuggestedEdit(range: PlatformRange, suggestedText: string): Promise<void>;
    applyBatchSuggestedEdits?(
        edits: Array<{ range: PlatformRange; suggestedText: string }>
    ): Promise<boolean[]>;
    insertAfterRange(range: PlatformRange, suggestedText: string): Promise<void>;
    revertEdit(range: PlatformRange, originalText: string, suggestedText?: string): Promise<void>;
}

/** 导航与高亮 */
export interface INavigationHelper {
    navigateToRange(range: PlatformRange): Promise<void>;
    highlightRange(range: PlatformRange, color?: string): Promise<void>;
    clearHighlight(range: PlatformRange): Promise<void>;
    navigateAndHighlight(range: PlatformRange): Promise<void>;
}

/** 审查报告生成 */
export interface IReportGenerator {
    generateReport(
        result: ReviewResult,
        summary: ContractSummary | null,
        contractTypeLabel?: string
    ): Promise<void>;
}

/** 条款插入 */
export interface IClauseInserter {
    insertTextAtSelection(content: string): Promise<void>;
}

/**
 * 统一平台适配器
 */
export interface IPlatformAdapter {
    readonly platform: PlatformType;
    readonly documentReader: IDocumentReader;
    readonly rangeMapper: IRangeMapper;
    readonly commentManager: ICommentManager;
    readonly trackChangesManager: ITrackChangesManager;
    readonly navigationHelper: INavigationHelper;
    readonly reportGenerator: IReportGenerator;
    readonly clauseInserter: IClauseInserter;
    invalidateMappingCache?(): void;
    initialize(): Promise<boolean>;
    isAvailable(): boolean;
}
