import type { LegalDocumentType } from './legalDocument';

/**
 * 后端共享 ReviewIssue 类型（与前端保持一致）
 */
export type RiskLevel = 'high' | 'medium' | 'low' | 'info';
export type IssueCategory =
    | 'risk_clause'
    | 'missing_clause'
    | 'compliance'
    | 'clause_analysis'
    | 'format'
    | 'fact'
    | 'legal_basis'
    | 'claim'
    | 'evidence'
    | 'adversarial'
    | 'conclusion'
    | 'assumptions'
    | 'disclaimer'
    | 'structure';

export interface ReviewIssue {
    id: string;
    category: IssueCategory;
    riskLevel: RiskLevel;
    title: string;
    description: string;
    originalText: string;
    suggestedText?: string;
    legalBasis?: string;
    status: 'pending' | 'located' | 'commented' | 'applied' | 'dismissed';
}

export interface ReviewResultMeta {
    documentType?: LegalDocumentType;
    documentLabel?: string;
}
