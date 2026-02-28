/* global Office */

import type { IPlatformAdapter } from '../types';
import { createWordDocumentReader } from './wordDocumentReader';
import { createWordRangeMapper } from './wordRangeMapper';
import { createWordCommentManager } from './wordCommentManager';
import { createWordTrackChangesManager } from './wordTrackChanges';
import { createWordNavigationHelper } from './wordNavigation';
import { createWordReportGenerator } from './wordReportGenerator';
import { createWordClauseInserter } from './wordClauseInserter';

export function createWordAdapter(): IPlatformAdapter {
    return {
        platform: 'word',
        documentReader: createWordDocumentReader(),
        rangeMapper: createWordRangeMapper(),
        commentManager: createWordCommentManager(),
        trackChangesManager: createWordTrackChangesManager(),
        navigationHelper: createWordNavigationHelper(),
        reportGenerator: createWordReportGenerator(),
        clauseInserter: createWordClauseInserter(),

        async initialize(): Promise<boolean> {
            return new Promise((resolve) => {
                Office.onReady((info) => {
                    resolve(info.host === Office.HostType.Word);
                });
            });
        },

        isAvailable(): boolean {
            return typeof (window as any).Office !== 'undefined';
        },
    };
}
