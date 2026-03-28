export type ElementPleadingOrientation = 'request' | 'response';
export type ElementPleadingDocumentKind =
    | 'main_pleading'
    | 'third_party_statement'
    | 'evidence_list'
    | 'cross_examination'
    | 'analysis_table'
    | 'info_table';

export type ElementPleadingCategoryId =
    | 'criminal_private'
    | 'civil'
    | 'commercial'
    | 'intellectual_property'
    | 'maritime'
    | 'administrative'
    | 'environment_resources'
    | 'state_compensation'
    | 'enforcement';

export interface ElementPleadingTemplateSummary {
    templateId: string;
    categoryId: ElementPleadingCategoryId;
    categoryLabel: string;
    documentKind: ElementPleadingDocumentKind;
    documentTitle: string;
    caseTitle?: string;
    label: string;
    orientation: ElementPleadingOrientation;
}

export interface ElementPleadingTemplateCategory {
    id: ElementPleadingCategoryId;
    label: string;
    items: ElementPleadingTemplateSummary[];
}

export interface ElementPleadingApiRequest {
    content: string;
    provider: string;
    model: string;
    templateId: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
}

export interface ElementPleadingApiResponse {
    base64Docx: string;
    fileName?: string | undefined;
    warnings: string[];
}
