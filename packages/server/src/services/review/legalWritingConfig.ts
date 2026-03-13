import type { LegalDocumentType } from '../../types/legalDocument';

export const LEGAL_DOCUMENT_TYPE_LABELS: Record<LegalDocumentType, string> = {
    contract: '合同文书',
    litigation: '诉讼文书',
    legal_opinion: '法律意见书',
};

export const DEFAULT_REVIEW_LABELS: Record<LegalDocumentType, string> = {
    contract: '合同文书审校',
    litigation: '诉讼文书审校',
    legal_opinion: '法律意见书审校',
};
