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
            return "租 赁 合 同\n甲方（出租方）：Mock Company A\n乙方（承租方）：Mock Company B\n\n1. 租赁期限为100年。\n2. 乙方如违约，需赔偿甲方一千万元人民币。本款为不可撤销条款。";
        },
        async readParagraphs() {
            return [
                { type: 'paragraph', text: "租 赁 合 同", index: 0 },
                { type: 'paragraph', text: "甲方（出租方）：Mock Company A", index: 1 },
                { type: 'paragraph', text: "乙方（承租方）：Mock Company B", index: 2 },
                { type: 'paragraph', text: "1. 租赁期限为100年。", index: 3 },
                { type: 'paragraph', text: "2. 乙方如违约，需赔偿甲方一千万元人民币。本款为不可撤销条款。", index: 4 }
            ];
        },
        async readStructured() {
            return this.readParagraphs();
        },
        async getWordCount() {
            return 100;
        },
        async readSelection() {
            return "2. 乙方如违约，需赔偿甲方一千万元人民币。本款为不可撤销条款。";
        }
    };

    rangeMapper: IRangeMapper = {
        async findRange(originalText) {
            console.log('[MockAdapter] findRange:', originalText);
            return { _internal: 'mock_range', _platform: 'unknown' };
        }
    };

    commentManager: ICommentManager = {
        async addComment(range, text) {
            console.log('[MockAdapter] addComment:', text);
        },
        async addBatchComments(comments) {
            console.log('[MockAdapter] addBatchComments:', comments.length, 'comments');
        },
        async removeComment(range, text) {
            console.log('[MockAdapter] removeComment:', text);
        }
    };

    trackChangesManager: ITrackChangesManager = {
        async applySuggestedEdit(range, suggestedText) {
            console.log('[MockAdapter] applySuggestedEdit:', suggestedText);
            // 这里可以加一个延迟动画模拟
            await new Promise(r => setTimeout(r, 500));
        },
        async insertAfterRange(range, suggestedText) {
            console.log('[MockAdapter] insertAfterRange:', suggestedText);
            await new Promise(r => setTimeout(r, 500));
        },
        async revertEdit(range, originalText, suggestedText) {
            console.log('[MockAdapter] revertEdit:', originalText);
            await new Promise(r => setTimeout(r, 500));
        }
    };

    navigationHelper: INavigationHelper = {
        async navigateToRange(range) {
            console.log('[MockAdapter] navigateToRange');
            await new Promise(r => setTimeout(r, 300));
        },
        async highlightRange(range, color) {
            console.log('[MockAdapter] highlightRange color:', color);
        },
        async clearHighlight(range) {
            console.log('[MockAdapter] clearHighlight');
        },
        async navigateAndHighlight(range) {
            console.log('[MockAdapter] navigateAndHighlight');
            await new Promise(r => setTimeout(r, 500));
        }
    };

    reportGenerator: IReportGenerator = {
        async generateReport(result, summary, contractTypeLabel) {
            console.log('[MockAdapter] generateReport');
        }
    };

    clauseInserter: IClauseInserter = {
        async insertTextAtSelection(content) {
            console.log('[MockAdapter] insertTextAtSelection:', content);
            await new Promise(r => setTimeout(r, 500));
        }
    };
}

export function createMockAdapter(): IPlatformAdapter {
    return new MockAdapter();
}
