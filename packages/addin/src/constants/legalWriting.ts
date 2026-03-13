import type { LegalDocumentType } from '../types/legalDocument';
import type { IssueCategory } from '../types/review';

export const LEGAL_DOCUMENT_TYPE_OPTIONS: Array<{
    id: LegalDocumentType;
    label: string;
    description: string;
    emptyStateTitle: string;
    emptyStateHint: string;
}> = [
    {
        id: 'contract',
        label: '合同文书',
        description: '合同、协议、补充协议等',
        emptyStateTitle: '开始审校合同或协议',
        emptyStateHint: '支持风险识别、缺失条款补强、批注与修订建议',
    },
    {
        id: 'litigation',
        label: '诉讼文书',
        description: '起诉状、答辩状、代理词等',
        emptyStateTitle: '开始审校诉讼文书',
        emptyStateHint: '重点检查格式、事实、请求事项、证据关联与对抗性分析',
    },
    {
        id: 'legal_opinion',
        label: '法律意见书',
        description: '尽调报告、合规意见、交易意见等',
        emptyStateTitle: '开始审校法律意见书',
        emptyStateHint: '重点检查结论措辞、假设前提、法规时效与免责声明',
    },
];

export const LEGAL_DOCUMENT_TYPE_LABELS: Record<LegalDocumentType, string> = LEGAL_DOCUMENT_TYPE_OPTIONS.reduce(
    (acc, item) => ({ ...acc, [item.id]: item.label }),
    {} as Record<LegalDocumentType, string>,
);

export const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
    risk_clause: '风险条款',
    missing_clause: '缺失条款',
    compliance: '合规问题',
    clause_analysis: '条款分析',
    format: '格式规范',
    fact: '事实陈述',
    legal_basis: '法律适用',
    claim: '请求事项',
    evidence: '证据关联',
    adversarial: '对抗分析',
    conclusion: '结论措辞',
    assumptions: '假设前提',
    disclaimer: '免责声明',
    structure: '结构完整性',
};

export const DOCUMENT_TYPE_CATEGORIES: Record<LegalDocumentType, IssueCategory[]> = {
    contract: ['risk_clause', 'missing_clause', 'compliance', 'clause_analysis'],
    litigation: ['format', 'fact', 'legal_basis', 'claim', 'evidence', 'adversarial'],
    legal_opinion: ['conclusion', 'legal_basis', 'assumptions', 'disclaimer', 'structure', 'format'],
};

export function getOriginalTextLabel(category: IssueCategory): string {
    if (category === 'missing_clause') return '建议补强位置：';
    if (category === 'evidence') return '对应主张原文：';
    if (category === 'adversarial') return '需预判回应的原文：';
    return '原文定位：';
}
