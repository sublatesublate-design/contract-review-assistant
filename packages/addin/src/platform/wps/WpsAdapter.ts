import type { IPlatformAdapter, PlatformType } from '../types';
import { WpsDocumentReader } from './wpsDocumentReader';
import { WpsRangeMapper } from './wpsRangeMapper';
import { WpsCommentManager } from './wpsCommentManager';
import { WpsTrackChangesManager } from './wpsTrackChanges';
import { WpsNavigationHelper } from './wpsNavigation';
import { WpsReportGenerator } from './wpsReportGenerator';
import { WpsClauseInserter } from './wpsClauseInserter';

export class WpsAdapter implements IPlatformAdapter {
    public readonly platform: PlatformType = 'wps';

    public readonly documentReader = new WpsDocumentReader();
    public readonly rangeMapper = new WpsRangeMapper();
    public readonly commentManager = new WpsCommentManager();
    public readonly trackChangesManager = new WpsTrackChangesManager();
    public readonly navigationHelper = new WpsNavigationHelper();
    public readonly reportGenerator = new WpsReportGenerator();
    public readonly clauseInserter = new WpsClauseInserter();

    public async initialize(): Promise<boolean> {
        return this.isAvailable();
    }

    public invalidateMappingCache(): void {
        this.rangeMapper.invalidateCache();
    }

    public isAvailable(): boolean {
        return typeof window !== 'undefined' && !!window.wps;
    }
}

export function createWpsAdapter(): IPlatformAdapter {
    return new WpsAdapter();
}
