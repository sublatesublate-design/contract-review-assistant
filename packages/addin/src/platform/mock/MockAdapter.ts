import type {
    IPlatformAdapter,
    IDocumentReader,
    IRangeMapper,
    ICommentManager,
    ITrackChangesManager,
    INavigationHelper,
    IReportGenerator,
    IClauseInserter,
    DocumentSection,
    PlatformRange,
    PlatformType,
} from '../types';

import type { ReviewResult } from '../../types/review';
import type { ContractSummary } from '../../types/summary';

const MOCK_TEXT = `\u79df\u8d41\u5408\u540c
\u7532\u65b9\uff08\u51fa\u79df\u65b9\uff09\uff1aMock Company A
\u4e59\u65b9\uff08\u627f\u79df\u65b9\uff09\uff1aMock Company B

1. \u79df\u8d41\u671f\u9650\u4e3a100\u5e74\u3002
2. \u4e59\u65b9\u5982\u8fdd\u7ea6\uff0c\u9700\u8d54\u507f\u7532\u65b9\u4e00\u5343\u4e07\u5143\u4eba\u6c11\u5e01\u3002`;

export class MockAdapter implements IPlatformAdapter {
    platform: PlatformType = 'unknown';

    isAvailable(): boolean {
        return true;
    }

    async initialize(): Promise<boolean> {
        console.log('[MockAdapter] Initialized for browser recording context');
        return true;
    }

    documentReader: IDocumentReader = {
        async readFullText() {
            return MOCK_TEXT;
        },
        async readParagraphs() {
            const lines = MOCK_TEXT.split(/\n/);
            const sections: DocumentSection[] = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line) continue;
                const trimmed = line.trim();
                if (!trimmed) continue;
                sections.push({ type: 'paragraph', text: trimmed, index: i });
            }
            return sections;
        },
        async readStructured() {
            return this.readParagraphs();
        },
        async getWordCount() {
            return MOCK_TEXT.replace(/\s+/g, '').length;
        },
        async readSelection() {
            return '2. \u4e59\u65b9\u5982\u8fdd\u7ea6\uff0c\u9700\u8d54\u507f\u7532\u65b9\u4e00\u5343\u4e07\u5143\u4eba\u6c11\u5e01\u3002';
        },
    };

    rangeMapper: IRangeMapper = {
        async findRange(originalText) {
            console.log('[MockAdapter] findRange:', originalText);
            return { _internal: { start: 0, end: 1 }, _platform: 'unknown' } as PlatformRange;
        },
    };

    commentManager: ICommentManager = {
        async addComment(_range, text) {
            console.log('[MockAdapter] addComment:', text);
        },
        async addBatchComments(comments) {
            console.log('[MockAdapter] addBatchComments:', comments.length, 'comments');
            return comments.map(() => true);
        },
        async removeComment(_range, text) {
            console.log('[MockAdapter] removeComment:', text);
        },
    };

    trackChangesManager: ITrackChangesManager = {
        async applySuggestedEdit(_range, suggestedText) {
            console.log('[MockAdapter] applySuggestedEdit:', suggestedText);
            await new Promise((r) => setTimeout(r, 120));
        },
        async applyBatchSuggestedEdits(edits) {
            console.log('[MockAdapter] applyBatchSuggestedEdits:', edits.length, 'edits');
            await new Promise((r) => setTimeout(r, 120));
            return edits.map(() => true);
        },
        async insertAfterRange(_range, suggestedText) {
            console.log('[MockAdapter] insertAfterRange:', suggestedText);
            await new Promise((r) => setTimeout(r, 120));
        },
        async revertEdit(_range, originalText, _suggestedText) {
            console.log('[MockAdapter] revertEdit:', originalText);
            await new Promise((r) => setTimeout(r, 120));
        },
    };

    navigationHelper: INavigationHelper = {
        async navigateToRange(_range) {
            console.log('[MockAdapter] navigateToRange');
            await new Promise((r) => setTimeout(r, 80));
        },
        async highlightRange(_range, color) {
            console.log('[MockAdapter] highlightRange color:', color);
        },
        async clearHighlight(_range) {
            console.log('[MockAdapter] clearHighlight');
        },
        async navigateAndHighlight(_range) {
            console.log('[MockAdapter] navigateAndHighlight');
            await new Promise((r) => setTimeout(r, 80));
        },
    };

    reportGenerator: IReportGenerator = {
        async generateReport(_result: ReviewResult, _summary: ContractSummary | null, _contractTypeLabel?: string) {
            console.log('[MockAdapter] generateReport');
        },
    };

    openGeneratedDocx = async (
        base64Docx: string,
        fileName?: string,
    ): Promise<void> => {
        console.log('[MockAdapter] openGeneratedDocx:', {
            fileName,
            base64Length: base64Docx.length,
        });
        await new Promise((r) => setTimeout(r, 120));
    };

    clauseInserter: IClauseInserter = {
        async insertTextAtSelection(content) {
            console.log('[MockAdapter] insertTextAtSelection:', content);
            await new Promise((r) => setTimeout(r, 120));
        },
    };
}

export function createMockAdapter(): IPlatformAdapter {
    return new MockAdapter();
}
