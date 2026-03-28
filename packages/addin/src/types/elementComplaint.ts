export interface ElementComplaintApiRequest {
    content: string;
    provider: string;
    model: string;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
}

export interface ElementComplaintTitle {
    main: string;
    sub?: string | undefined;
}

export interface ElementComplaintParagraphBlock {
    type: 'paragraph';
    text: string;
    align?: 'left' | 'center' | 'right' | 'justify' | undefined;
    bold?: boolean;
}

export interface ElementComplaintTablePairRow {
    type: 'pair';
    label: string;
    value: string;
    labelBold?: boolean;
    valueBold?: boolean;
}

export interface ElementComplaintTableFullRow {
    type: 'full';
    text: string;
    bold?: boolean;
    align?: 'left' | 'center' | 'right' | 'justify' | undefined;
}

export type ElementComplaintTableRow = ElementComplaintTablePairRow | ElementComplaintTableFullRow;

export interface ElementComplaintTableBlock {
    type: 'table';
    title?: string | undefined;
    rows: ElementComplaintTableRow[];
}

export type ElementComplaintBlock = ElementComplaintParagraphBlock | ElementComplaintTableBlock;

export interface ElementComplaintFooter {
    lines: string[];
    align?: 'left' | 'center' | 'right' | undefined;
}

export interface ElementComplaintRenderModel {
    title: ElementComplaintTitle;
    instructions: string[];
    blocks: ElementComplaintBlock[];
    footer: ElementComplaintFooter;
}

export interface ElementComplaintApiResponse {
    detectedCaseType: string;
    confidence: number;
    renderModel: ElementComplaintRenderModel;
    warnings: string[];
}
