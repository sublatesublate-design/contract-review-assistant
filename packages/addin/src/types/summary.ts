export type SummaryStatus = 'idle' | 'loading' | 'done' | 'error';

export interface SummaryField {
    label: string;
    value: string;
}

export interface SummarySection {
    title: string;
    items: string[];
}

export interface StructuredSummary {
    title: string;
    overview?: string;
    fields: SummaryField[];
    sections: SummarySection[];
}

export type ContractSummary = StructuredSummary;
