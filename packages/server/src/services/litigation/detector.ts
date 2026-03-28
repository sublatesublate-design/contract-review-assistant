import type { ComplaintCaseTypeKey } from '../../types/elementComplaint';
import type { ComplaintDetectionResult } from './types';
import { COMPLAINT_TEMPLATE_DEFINITIONS, COMPLAINT_TEMPLATE_LABELS } from './templates';

function countHits(text: string, keywords: string[]): { matched: string[]; score: number } {
    const matched: string[] = [];
    for (const keyword of keywords) {
        if (!keyword) continue;
        if (text.includes(keyword.toLowerCase())) {
            matched.push(keyword);
        }
    }
    return { matched, score: matched.length };
}

export function detectComplaintCaseType(text: string): ComplaintDetectionResult {
    const sample = text.slice(0, 6000).toLowerCase();

    let bestMatch: ComplaintDetectionResult | null = null;

    for (const template of COMPLAINT_TEMPLATE_DEFINITIONS) {
        if (template.caseType === 'general') {
            continue;
        }

        const positive = countHits(sample, template.detection.keywords);
        const negative = countHits(sample, template.detection.negativeKeywords ?? []);
        const score = positive.score * 2 - negative.score * 3;

        if (score <= 0) {
            continue;
        }

        const confidence: ComplaintDetectionResult['confidence'] =
            score >= 6 || positive.score >= 4 ? 'high' : score >= 3 ? 'medium' : 'low';

        const warnings: string[] = [];
        if (negative.score > 0) {
            warnings.push(`检测到可能混淆案由的词语：${negative.matched.join('、')}`);
        }

        const candidate: ComplaintDetectionResult = {
            caseType: template.caseType,
            label: template.label,
            confidence,
            score,
            warnings,
        };

        if (!bestMatch || candidate.score > bestMatch.score) {
            bestMatch = candidate;
        }
    }

    if (!bestMatch) {
        return {
            caseType: 'general',
            label: COMPLAINT_TEMPLATE_LABELS.general,
            confidence: 'low',
            score: 0,
            warnings: ['未能稳定识别案由，已回退至通用民事纠纷模板'],
        };
    }

    if (bestMatch.confidence === 'low') {
        bestMatch.warnings.push('案由识别置信度较低，建议人工复核模板适配结果');
    }

    return bestMatch;
}

export function isSupportedComplaintCaseType(caseType: string): caseType is ComplaintCaseTypeKey {
    return (['divorce', 'sale', 'private_loan', 'traffic', 'general'] as const).includes(caseType as ComplaintCaseTypeKey);
}

