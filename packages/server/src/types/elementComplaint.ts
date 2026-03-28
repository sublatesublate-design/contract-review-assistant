export type ComplaintCaseTypeKey = 'divorce' | 'sale' | 'private_loan' | 'traffic' | 'general';

export type ComplaintConfidence = 'high' | 'medium' | 'low';

export interface ComplaintTitle {
    main: string;
    subtitle: string;
}

export interface ComplaintFooter {
    court: string;
    signerLabel: string;
    dateLabel: string;
}

export interface ComplaintTableRow {
    label: string;
    content: string;
    hint?: string;
}

export interface ComplaintTableBlock {
    type: 'party-table' | 'claim-table' | 'fact-table' | 'tail-table';
    title: string;
    rows: ComplaintTableRow[];
}

export interface ComplaintParagraphBlock {
    type: 'paragraph';
    text: string;
}

export type ComplaintBlock = ComplaintTableBlock | ComplaintParagraphBlock;

export interface ElementComplaintRenderModel {
    title: ComplaintTitle;
    instructions: string;
    blocks: ComplaintBlock[];
    footer: ComplaintFooter;
}

export interface ElementComplaintResponse {
    detectedCaseType: string;
    confidence: ComplaintConfidence;
    renderModel: ElementComplaintRenderModel;
    warnings: string[];
}
