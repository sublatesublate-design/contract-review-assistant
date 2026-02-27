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
    | 'clause_analysis';  // 条款分析建议

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
    /** 自动识别的合同类型 */
    contractType?: string;
    /** 合同类型显示标签 */
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
