export type SummaryStatus = 'idle' | 'loading' | 'done' | 'error';

export interface ContractSummary {
    parties: Array<{ role: string; name: string }>;
    contractType: string;
    amount: string;
    duration: string;
    keyDates: string[];
    coreObligations: string[];
    disputeResolution: string;
}
