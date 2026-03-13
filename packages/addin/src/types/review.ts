import type { LegalDocumentType } from './legalDocument';

/**
 * 审查问题的严重等级
 */
export type RiskLevel = 'high' | 'medium' | 'low' | 'info';

/**
 * 审查问题的分类
 */
export type IssueCategory =
    | 'risk_clause'       // 风险条款
    | 'missing_clause'    // 缺失条款
    | 'compliance'        // 合规性问题
    | 'clause_analysis'   // 条款分析建议
    | 'format'            // 格式规范
    | 'fact'              // 事实陈述
    | 'legal_basis'       // 法律依据
    | 'claim'             // 请求事项
    | 'evidence'          // 证据关联
    | 'adversarial'       // 对抗性分析
    | 'conclusion'        // 结论措辞
    | 'assumptions'       // 假设前提
    | 'disclaimer'        // 免责声明
    | 'structure';        // 结构完整性

/**
 * 单个审查问题
 */
export interface ReviewIssue {
    id: string;
    /** 问题分类 */
    category: IssueCategory;
    /** 风险等级 */
    riskLevel: RiskLevel;
    /** 问题标题（简短描述） */
    title: string;
    /** 详细描述 */
    description: string;
    /** 合同中的原文（用于定位） */
    originalText: string;
    /** AI 建议的修改内容（可选） */
    suggestedText?: string;
    /** 相关法律依据（可选） */
    legalBasis?: string;
    /** 当前状态 */
    status: 'pending' | 'located' | 'commented' | 'applied' | 'dismissed';
}

/**
 * 审查结果汇总
 */
export interface ReviewResult {
    issues: ReviewIssue[];
    summary: string;
    /** 审查耗时（毫秒） */
    durationMs: number;
    /** 使用的 AI 模型 */
    model: string;
    createdAt: string;
    /** 当前审校所采用的文书类型 */
    documentType?: LegalDocumentType;
    /** 当前审校模式或识别结果的显示标签 */
    documentLabel?: string;
    /** @deprecated 为兼容旧历史数据暂时保留 */
    contractType?: string;
    /** @deprecated 为兼容旧历史数据暂时保留 */
    contractLabel?: string;
}

/**
 * 审查状态
 */
export type ReviewStatus =
    | 'idle'        // 等待开始
    | 'reading'     // 读取文档
    | 'analyzing'   // AI 分析中
    | 'completed'   // 完成
    | 'error';      // 错误
