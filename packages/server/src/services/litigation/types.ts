export type PleadingOrientation = 'request' | 'response';

export type TemplateDocumentKind =
    | 'main_pleading'
    | 'third_party_statement'
    | 'evidence_list'
    | 'cross_examination'
    | 'analysis_table'
    | 'info_table';

export type TemplateCategoryId =
    | 'criminal_private'
    | 'civil'
    | 'commercial'
    | 'intellectual_property'
    | 'maritime'
    | 'administrative'
    | 'environment_resources'
    | 'state_compensation'
    | 'enforcement';

export interface TemplateCatalogItem {
    templateId: string;
    categoryId: TemplateCategoryId;
    categoryLabel: string;
    documentKind: TemplateDocumentKind;
    documentTitle: string;
    caseTitle?: string;
    label: string;
    orientation: PleadingOrientation;
    templateFile: string;
    manifestFile: string;
    fileNamePrefix: string;
}

export interface TemplateCatalogCategory {
    id: TemplateCategoryId;
    label: string;
    items: TemplateCatalogItem[];
}

export interface TemplateManifestField {
    key: string;
    label: string;
    blockTitle: string;
    sourceSection: 'court' | 'parties' | 'request_or_response' | 'facts' | 'footer';
    required: boolean;
    multiline: boolean;
    hint?: string;
}

export interface TemplateManifest extends TemplateCatalogItem {
    fields: TemplateManifestField[];
}

export interface ParsedPleadingStructure {
    rawText: string;
    normalizedText: string;
    court: string;
    plaintiffSection: string;
    defendantSection: string;
    thirdPartySection: string;
    partySections: string;
    requestOrResponseSection: string;
    factSection: string;
    evidenceSection: string;
    closingSection: string;
    rawContent: string;
    warnings: string[];
}

export interface ElementPleadingExtractionResult {
    values: Record<string, string>;
    warnings: string[];
}

export interface ElementPleadingDocxResponse {
    fileName: string;
    docxBase64: string;
    warnings: string[];
}

export type ComplaintBlockType = 'party-table' | 'claim-table' | 'fact-table' | 'tail-table' | 'paragraph';

export interface ComplaintTemplateRowDefinition {
    key: string;
    label: string;
    hint?: string;
}

export interface ComplaintTemplateTableBlockDefinition {
    type: 'party-table' | 'claim-table' | 'fact-table' | 'tail-table';
    title: string;
    rows: ComplaintTemplateRowDefinition[];
}

export interface ComplaintTemplateParagraphBlockDefinition {
    type: 'paragraph';
    text: string;
}

export type ComplaintTemplateBlockDefinition =
    | ComplaintTemplateTableBlockDefinition
    | ComplaintTemplateParagraphBlockDefinition;

export interface ComplaintTemplateDetectionRule {
    keywords: string[];
    negativeKeywords?: string[];
}

export interface ComplaintTemplateDefinition {
    caseType: import('../../types/elementComplaint').ComplaintCaseTypeKey;
    label: string;
    instructions: string;
    detection: ComplaintTemplateDetectionRule;
    blocks: ComplaintTemplateBlockDefinition[];
}

export interface ComplaintExtractionResult {
    court?: string;
    values: Record<string, string>;
    warnings?: string[];
}

export interface ComplaintDetectionResult {
    caseType: import('../../types/elementComplaint').ComplaintCaseTypeKey;
    label: string;
    confidence: 'high' | 'medium' | 'low';
    score: number;
    warnings: string[];
}
