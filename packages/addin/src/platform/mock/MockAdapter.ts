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
    PlatformType
} from '../types';

import type { ReviewResult } from '../../types/review';
import type { ContractSummary } from '../../types/summary';

const MOCK_TEXT = `租赁合同\n甲方（出租方）：Mock Company A\n乙方（承租方）：Mock Company B\n\n1. 租赁期限为100年。\n2. 乙方如违约，需赔偿甲方一千万元人民币。`;

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
            return '2. 乙方如违约，需赔偿甲方一千万元人民币。';
        }
    };

    rangeMapper: IRangeMapper = {
        async findRange(originalText) {
            console.log('[MockAdapter] findRange:', originalText);
            return { _internal: { start: 0, end: 1 }, _platform: 'unknown' } as PlatformRange;
        }
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
        }
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
        }
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
        }
    };

    reportGenerator: IReportGenerator = {
        async generateReport(_result: ReviewResult, _summary: ContractSummary | null, _contractTypeLabel?: string) {
            console.log('[MockAdapter] generateReport');
        }
    };

    clauseInserter: IClauseInserter = {
        async insertTextAtSelection(content) {
            console.log('[MockAdapter] insertTextAtSelection:', content);
            await new Promise((r) => setTimeout(r, 120));
        }
    };
}

export function createMockAdapter(): IPlatformAdapter {
    return new MockAdapter();
}
