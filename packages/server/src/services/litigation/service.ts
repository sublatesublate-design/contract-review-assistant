import type { AIProvider } from '../ai/types';
import type {
    ComplaintBlock,
    ComplaintCaseTypeKey,
    ComplaintConfidence,
    ElementComplaintRenderModel,
    ElementComplaintResponse,
} from '../../types/elementComplaint';
import { detectComplaintCaseType } from './detector';
import { parseComplaintStructure, parsePleadingStructure } from './parser';
import {
    buildElementComplaintSystemPrompt,
    buildElementComplaintUserPrompt,
    buildElementPleadingSystemPrompt,
    buildElementPleadingUserPrompt,
} from './prompt';
import { loadTemplateManifestById } from './templateAssets';
import { clearUnreplacedTokensInDocx, findUnreplacedTokensInDocx, renderTemplateDocx } from './templateRenderer';
import { getComplaintTemplate } from './templates';
import type {
    ComplaintExtractionResult,
    ComplaintTemplateDefinition,
    ElementPleadingDocxResponse,
    ParsedPleadingStructure,
    TemplateManifest,
    TemplateManifestField,
} from './types';

function stripCodeFence(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('```')) {
        return trimmed
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
    }
    return trimmed;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
    const cleaned = stripCodeFence(text);

    try {
        return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const candidate = cleaned.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(candidate) as Record<string, unknown>;
            } catch {
                return null;
            }
        }
        return null;
    }
}

function normalizeScalar(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeScalar(item)).filter(Boolean).join('\n');
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return '';
}

function normalizeWarnings(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => normalizeScalar(item)).filter(Boolean);
}

function normalizeExtractionResult(
    raw: Record<string, unknown> | null,
    template: ComplaintTemplateDefinition,
    parsedWarnings: string[],
): ComplaintExtractionResult & { warnings: string[] } {
    const warnings = [...parsedWarnings];
    const values: Record<string, string> = {};
    let court = '';

    if (!raw) {
        warnings.push('模型返回内容不是有效 JSON，已回退为空值');
        for (const block of template.blocks) {
            if (block.type === 'paragraph') continue;
            for (const row of block.rows) {
                values[row.key] = '';
            }
        }
        return { court, values, warnings };
    }

    court = normalizeScalar(raw['court']);
    const rawValues = raw['values'];
    if (rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)) {
        for (const [key, value] of Object.entries(rawValues)) {
            values[key] = normalizeScalar(value);
        }
    } else {
        warnings.push('模型返回 JSON 中缺少 values 对象，已回退为空值');
    }

    warnings.push(...normalizeWarnings(raw['warnings']));

    for (const block of template.blocks) {
        if (block.type === 'paragraph') continue;
        for (const row of block.rows) {
            if (!(row.key in values)) {
                values[row.key] = '';
            }
        }
    }

    return { court, values, warnings };
}

function mergeWarnings(...warningGroups: Array<string[] | undefined>): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const group of warningGroups) {
        for (const warning of group ?? []) {
            const normalized = warning.trim();
            if (!normalized || seen.has(normalized)) {
                continue;
            }
            seen.add(normalized);
            merged.push(normalized);
        }
    }
    return merged;
}

function buildRenderModel(
    template: ComplaintTemplateDefinition,
    parsed: ParsedPleadingStructure,
    extraction: ComplaintExtractionResult & { warnings: string[] },
): ElementComplaintRenderModel {
    const blocks: ComplaintBlock[] = template.blocks.map((block) => {
        if (block.type === 'paragraph') {
            return {
                type: 'paragraph',
                text: block.text,
            };
        }

        return {
            type: block.type,
            title: block.title,
            rows: block.rows.map((row) => ({
                label: row.label,
                content: extraction.values[row.key] ?? '',
                ...(row.hint ? { hint: row.hint } : {}),
            })),
        };
    });

    return {
        title: {
            main: '民事起诉状',
            subtitle: `（${template.label}）`,
        },
        instructions: template.instructions,
        blocks,
        footer: {
            court: extraction.court || parsed.court || '',
            signerLabel: '具状人（签字、盖章）',
            dateLabel: '日期',
        },
    };
}

function buildMissingFieldWarnings(template: ComplaintTemplateDefinition, extraction: ComplaintExtractionResult & { warnings: string[] }): string[] {
    const missing: string[] = [];
    for (const block of template.blocks) {
        if (block.type === 'paragraph') continue;
        for (const row of block.rows) {
            if (!extraction.values[row.key]?.trim()) {
                missing.push(row.label);
            }
        }
    }

    if (missing.length === 0) {
        return [];
    }

    const preview = missing.slice(0, 6).join('、');
    const suffix = missing.length > 6 ? `等${missing.length}项` : `${missing.length}项`;
    return [`要素提取未覆盖${suffix}：${preview}`];
}

function mapCaseTypeLabel(caseType: ComplaintCaseTypeKey): string {
    const template = getComplaintTemplate(caseType);
    return template.label;
}

function normalizePleadingExtractionResult(
    raw: Record<string, unknown> | null,
    manifest: TemplateManifest,
    parsedWarnings: string[],
): { values: Record<string, string>; warnings: string[] } {
    const warnings = [...parsedWarnings];
    const values: Record<string, string> = {};

    if (!raw) {
        warnings.push('模型返回内容不是有效 JSON，已回退为空值。');
        for (const field of manifest.fields) {
            values[field.key] = '';
        }
        return { values, warnings };
    }

    const rawValues = raw['values'];
    if (rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)) {
        for (const [key, value] of Object.entries(rawValues)) {
            values[key] = normalizeScalar(value);
        }
    } else {
        warnings.push('模型返回 JSON 中缺少 values 对象，已回退为空值。');
    }

    warnings.push(...normalizeWarnings(raw['warnings']));

    for (const field of manifest.fields) {
        if (!(field.key in values)) {
            values[field.key] = '';
        }
    }

    return { values, warnings };
}

const FIELD_STOPWORDS = new Set([
    '是否', '情况', '内容', '明细', '其他', '相关', '依据', '说明', '基本', '信息', '具体', '可以', '已经',
    '需要', '理由', '请求', '事项', '事实', '表格', '填写', '如下', '采用', '完整', '栏目', '部分', '其中',
]);

const FIELD_KEYWORD_SYNONYMS: Record<string, string[]> = {
    合同: ['合同', '协议', '借款协议', '买卖合同'],
    签订: ['签订', '签署', '订立'],
    签约: ['签约', '签署', '订立'],
    请求依据: ['依据', '根据', '民法典', '法律'],
    证据: ['证据', '借条', '转账', '记录', '承诺书', '聊天记录'],
    利率: ['利率', '利息', '年利率', '月利率'],
    还款: ['还款', '归还', '偿还', '清偿'],
    提供时间: ['转账', '支付', '出借', '提供'],
    借款金额: ['借款', '本金', '金额', '万元'],
    事故: ['事故', '碰撞', '责任认定'],
    婚姻: ['结婚', '婚姻', '离婚'],
};

const GUARANTEE_PATTERN = /担保|保证|抵押|质押|担保人|担保物/u;
const MEDIATION_PATTERN = /调解|先行调解|了解□|不了解□|是□|否□|暂不确定/u;
const SUPPLEMENTARY_PATTERN = /说明|补充|特别|另附|其他/u;

function splitSearchSegments(text: string): string[] {
    return text
        .replace(/\r\n/g, '\n')
        .split(/\n+/)
        .flatMap((line) => line.split(/[。；;]/))
        .map((segment) => segment.trim())
        .filter((segment) => segment.length >= 4);
}

function extractFieldKeywords(field: TemplateManifestField): string[] {
    const rawText = `${field.label} ${field.hint ?? ''}`;
    const baseTokens = rawText.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) ?? [];
    const keywords = new Set<string>();

    for (const token of baseTokens) {
        if (FIELD_STOPWORDS.has(token)) continue;
        keywords.add(token);

        for (const [needle, synonyms] of Object.entries(FIELD_KEYWORD_SYNONYMS)) {
            if (token.includes(needle) || needle.includes(token)) {
                for (const synonym of synonyms) {
                    keywords.add(synonym);
                }
            }
        }
    }

    return [...keywords];
}

function scoreSegment(segment: string, keywords: string[]): number {
    let score = 0;
    for (const keyword of keywords) {
        if (keyword.length < 2) continue;
        if (segment.includes(keyword)) {
            score += Math.max(1, Math.min(keyword.length, 4));
        }
    }
    return score;
}

function extractAgentSection(text: string): string {
    const match = text.match(/委托诉讼代理人[：:][^\n]*(?:\n(?!原告[：:]|被告[：:]|第三人[：:]|诉讼请求[：:]|答辩意见[：:]|答辩请求[：:]|事实与理由[：:]|证据[：:]|此致).+)*/u);
    return match?.[0]?.trim() ?? '';
}

function extractClosingValue(text: string, kind: 'signer' | 'date'): string {
    if (!text) return '';

    if (kind === 'signer') {
        const signerMatch = text.match(/(?:具状人|答辩人)(?:（[^）]*）|\([^)]*\))?[：:]\s*([^\n]+)/u);
        return signerMatch?.[1]?.trim() ?? '';
    }

    const dateMatch = text.match(/(\d{4}年\d{1,2}月\d{1,2}日)/u);
    return dateMatch?.[1]?.trim() ?? '';
}

function stripSectionHeading(text: string, headings: string[]): string {
    if (!text) return '';

    const lines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return '';
    }

    const firstLine = lines[0] ?? '';
    if (headings.some((heading) => firstLine === heading || firstLine === `${heading}：` || firstLine === `${heading}:`)) {
        lines.shift();
    } else {
        for (const heading of headings) {
            const matcher = new RegExp(`^${heading}[：:]\\s*`, 'u');
            if (matcher.test(firstLine)) {
                lines[0] = firstLine.replace(matcher, '');
                break;
            }
        }
    }

    return lines.join('\n').trim();
}

function resolveStructuredFallback(field: TemplateManifestField, parsed: ParsedPleadingStructure): string {
    if (/(诉讼请求|请求事项|申请事项|申请请求|赔偿请求|执行请求|异议请求)全文/u.test(field.label)) {
        return stripSectionHeading(parsed.requestOrResponseSection, ['诉讼请求', '请求事项', '申请事项', '申请请求', '异议请求', '赔偿请求', '执行请求']);
    }

    if (/(答辩意见|答辩请求|答辩事项|答辩理由|陈述意见)全文/u.test(field.label)) {
        return stripSectionHeading(parsed.requestOrResponseSection, ['答辩意见', '答辩请求', '答辩事项', '答辩理由', '陈述意见']);
    }

    if (/(事实与理由|事实和理由|申请理由|异议理由|主要事实与理由|理由)全文/u.test(field.label)) {
        return stripSectionHeading(parsed.factSection, ['事实与理由', '事实和理由', '申请理由', '异议理由', '主要事实与理由', '理由']);
    }

    if (field.label.includes('证据') && parsed.evidenceSection) {
        return stripSectionHeading(parsed.evidenceSection, ['证据清单', '证据和证据来源，证人姓名和住所', '证据']);
    }

    return '';
}

function shouldSkipKeywordFallback(field: TemplateManifestField, parsed: ParsedPleadingStructure): boolean {
    const searchableText = [parsed.requestOrResponseSection, parsed.factSection, parsed.evidenceSection, parsed.rawContent]
        .filter(Boolean)
        .join('\n');

    if (field.label.includes('其他需要说明')) {
        return true;
    }

    if (field.label.includes('调解')) {
        return !MEDIATION_PATTERN.test(searchableText);
    }

    if (field.label.includes('担保人、担保物')) {
        return !GUARANTEE_PATTERN.test(searchableText);
    }

    return false;
}

function normalizeFieldLabel(text: string): string {
    return text.replace(/\s+/g, '');
}

function hasSecuritySignal(text: string): boolean {
    return GUARANTEE_PATTERN.test(text);
}

function hasMediationSignal(text: string): boolean {
    return /调解/u.test(text);
}

function hasAdditionalNoteSignal(text: string): boolean {
    return /另附页|另行说明|补充说明|特别说明|其他需要说明|补充如下/u.test(text);
}

function sanitizeFieldValue(
    field: TemplateManifestField,
    value: string,
    parsed: ParsedPleadingStructure,
): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    if (/^(无|暂无|不适用|无异议)$/u.test(trimmed)) {
        return trimmed;
    }

    const normalizedLabel = normalizeFieldLabel(field.label);

    if (field.sourceSection !== 'footer' && /^此致/u.test(trimmed)) {
        return '';
    }

    if (/(诉讼请求|请求事项|申请事项|申请请求|赔偿请求|执行请求|异议请求)全文/u.test(field.label)) {
        return stripSectionHeading(trimmed, ['诉讼请求', '请求事项', '申请事项', '申请请求', '异议请求', '赔偿请求', '执行请求']);
    }

    if (/(答辩意见|答辩请求|答辩事项|答辩理由|陈述意见)全文/u.test(field.label)) {
        return stripSectionHeading(trimmed, ['答辩意见', '答辩请求', '答辩事项', '答辩理由', '陈述意见']);
    }

    if (/(事实与理由|事实和理由|申请理由|异议理由|主要事实与理由|理由)全文/u.test(field.label)) {
        return stripSectionHeading(trimmed, ['事实与理由', '事实和理由', '申请理由', '异议理由', '主要事实与理由', '理由']);
    }

    if (normalizedLabel.includes('其他需要说明')) {
        if (/^(无|暂无)$/u.test(trimmed)) {
            return trimmed;
        }
        if (!hasAdditionalNoteSignal(parsed.rawContent)) {
            return '';
        }
        if (!SUPPLEMENTARY_PATTERN.test(trimmed)) {
            return '';
        }
        if (/^(?:\d+[.、]|第\d+项|判令|依法判令|请求)/u.test(trimmed)) {
            return '';
        }
        return trimmed;
    }

    if (normalizedLabel.includes('担保人、担保物')) {
        if (/^(无|无异议|有异议|否)(?:$|[□\s；;，,])/u.test(trimmed)) {
            return trimmed;
        }
        if (!hasSecuritySignal(trimmed)) {
            return '';
        }
        return trimmed;
    }

    if (normalizedLabel.includes('调解')) {
        if (!hasMediationSignal(parsed.rawContent)) {
            return '';
        }
        if (!MEDIATION_PATTERN.test(trimmed)) {
            return '';
        }
        return trimmed;
    }

    if (
        normalizedLabel.startsWith('是否')
        && /担保|保证|抵押|质押/u.test(normalizedLabel)
        && !/^(是|否|无)(?:$|[□\s；;，,])/u.test(trimmed)
        && !hasSecuritySignal(trimmed)
    ) {
        return '';
    }

    return trimmed;
}

function sanitizeExtractedValues(
    manifest: TemplateManifest,
    parsed: ParsedPleadingStructure,
    values: Record<string, string>,
): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const field of manifest.fields) {
        sanitized[field.key] = sanitizeFieldValue(field, values[field.key] ?? '', parsed);
    }
    return sanitized;
}

function shouldSkipHeuristicFallback(field: TemplateManifestField, parsed: ParsedPleadingStructure): boolean {
    const normalizedLabel = normalizeFieldLabel(field.label);

    if (normalizedLabel.includes('其他需要说明')) {
        return true;
    }

    if (/调解/u.test(normalizedLabel) && !hasMediationSignal(parsed.rawContent)) {
        return true;
    }

    if (/担保|保证|抵押|质押/u.test(normalizedLabel) && !hasSecuritySignal(parsed.rawContent)) {
        return true;
    }

    return false;
}

function resolvePartyFallback(field: TemplateManifestField, parsed: ParsedPleadingStructure): string {
    if (field.label.includes('委托诉讼代理人')) {
        return extractAgentSection(parsed.partySections);
    }
    if (field.label.includes('第三人')) {
        return parsed.thirdPartySection;
    }
    if (field.label.includes('被答辩人') || field.label.includes('原告')) {
        return parsed.plaintiffSection;
    }
    if (field.label.includes('被告') || field.label.includes('答辩人')) {
        return parsed.defendantSection;
    }
    return '';
}

function findBestFieldSnippet(field: TemplateManifestField, parsed: ParsedPleadingStructure): string {
    const structured = resolveStructuredFallback(field, parsed);
    if (structured) {
        return structured;
    }

    if (field.sourceSection === 'parties') {
        return resolvePartyFallback(field, parsed);
    }

    if (shouldSkipHeuristicFallback(field, parsed)) {
        return '';
    }

    if (field.sourceSection === 'footer') {
        if (field.label.includes('日期')) {
            return extractClosingValue(parsed.closingSection, 'date');
        }
        if (field.label.includes('具状人') || field.label.includes('答辩人')) {
            return extractClosingValue(parsed.closingSection, 'signer');
        }
    }

    if (shouldSkipKeywordFallback(field, parsed)) {
        return '';
    }

    const keywords = extractFieldKeywords(field);
    if (keywords.length === 0) {
        return '';
    }

    const sourceTexts = field.sourceSection === 'request_or_response'
        ? [parsed.requestOrResponseSection, parsed.factSection, parsed.rawContent]
        : field.sourceSection === 'facts'
            ? [parsed.factSection, parsed.evidenceSection, parsed.requestOrResponseSection, parsed.rawContent]
            : [parsed.rawContent];

    const scoredSegments = sourceTexts
        .flatMap((text) => splitSearchSegments(text))
        .map((segment) => ({ segment, score: scoreSegment(segment, keywords) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.segment.length - right.segment.length);

    if (scoredSegments.length === 0 || scoredSegments[0]!.score < 2) {
        return '';
    }

    const selected: string[] = [];
    for (const item of scoredSegments) {
        if (selected.includes(item.segment)) continue;
        selected.push(item.segment);
        if (!field.multiline || selected.length >= 2) break;
    }

    return selected.join('\n');
}

function applyHeuristicFallbacks(
    manifest: TemplateManifest,
    parsed: ParsedPleadingStructure,
    values: Record<string, string>,
): Record<string, string> {
    const mergedValues = { ...values };

    for (const field of manifest.fields) {
        mergedValues[field.key] = sanitizeFieldValue(field, mergedValues[field.key] ?? '', parsed);
    }

    for (const field of manifest.fields) {
        if (mergedValues[field.key]?.trim()) {
            continue;
        }

        const fallback = findBestFieldSnippet(field, parsed).trim();
        if (fallback) {
            mergedValues[field.key] = fallback;
        }
    }

    for (const field of manifest.fields) {
        mergedValues[field.key] = sanitizeFieldValue(field, mergedValues[field.key] ?? '', parsed);
    }

    return mergedValues;
}

function buildElementPleadingWarnings(
    manifest: TemplateManifest,
    extraction: { values: Record<string, string>; warnings: string[] },
): string[] {
    const missing = manifest.fields
        .filter((field) => field.required && !extraction.values[field.key]?.trim())
        .map((field) => field.label);

    if (missing.length === 0) {
        return extraction.warnings;
    }

    const preview = missing.slice(0, 6).join('、');
    const suffix = missing.length > 6 ? `等 ${missing.length} 项` : `${missing.length} 项`;
    return mergeWarnings(extraction.warnings, [`模板必填字段缺失：${suffix}，${preview}`]);
}

const REQUEST_SIDE_PARTY_LABELS = [
    '\u539f\u544a',
    '\u7533\u8bf7\u4eba',
    '\u81ea\u8bc9\u4eba',
    '\u8d54\u507f\u8bf7\u6c42\u4eba',
    '\u7533\u8bf7\u6267\u884c\u4eba',
    '\u5f02\u8bae\u4eba',
    '\u6848\u5916\u4eba',
    '\u5229\u5bb3\u5173\u7cfb\u4eba',
];

const RESPONSE_SIDE_PARTY_LABELS = [
    '\u7b54\u8fa9\u4eba',
    '\u88ab\u544a',
    '\u88ab\u7533\u8bf7\u4eba',
    '\u8d54\u507f\u4e49\u52a1\u673a\u5173',
    '\u88ab\u6267\u884c\u4eba',
];

const THIRD_PARTY_OUTPUT_LABELS = ['\u7b2c\u4e09\u4eba'];

const ALL_OUTPUT_PARTY_LABELS = [
    ...REQUEST_SIDE_PARTY_LABELS,
    ...RESPONSE_SIDE_PARTY_LABELS,
    ...THIRD_PARTY_OUTPUT_LABELS,
    '\u88ab\u7b54\u8fa9\u4eba',
];

const PARTY_DETAIL_STOP_MARKERS = [
    '\u4f4f\u6240\u5730',
    '\u4f4f\u6240',
    '\u4f4f\u5740',
    '\u6237\u7c4d\u5730',
    '\u7ecf\u5e38\u5c45\u4f4f\u5730',
    '\u6cd5\u5b9a\u4ee3\u8868\u4eba',
    '\u6cd5\u5b9a\u4ee3\u7406\u4eba',
    '\u59d4\u6258\u8bc9\u8bbc\u4ee3\u7406\u4eba',
    '\u7edf\u4e00\u793e\u4f1a\u4fe1\u7528\u4ee3\u7801',
    '\u793e\u4f1a\u4fe1\u7528\u4ee3\u7801',
    '\u8eab\u4efd\u8bc1\u53f7',
    '\u516c\u6c11\u8eab\u4efd\u53f7\u7801',
    '\u8054\u7cfb\u7535\u8bdd',
    '\u6027\u522b',
    '\u6c11\u65cf',
    '\u51fa\u751f',
    '\u804c\u4e1a',
    '\u5de5\u4f5c\u5355\u4f4d',
    '\u90ae\u7f16',
];

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildOutputDateSuffix(): string {
    const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = Object.fromEntries(dateFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    return `${parts['year'] ?? ''}${parts['month'] ?? ''}${parts['day'] ?? ''}`;
}

function sanitizeOutputFileSegment(value: string, fallback: string): string {
    const normalized = value
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
        .replace(/\.+$/g, '')
        .trim();
    return normalized || fallback;
}

function pickOutputPartyLabels(manifest: TemplateManifest): string[] {
    if (manifest.documentKind === 'third_party_statement') {
        return THIRD_PARTY_OUTPUT_LABELS;
    }
    return manifest.orientation === 'response'
        ? RESPONSE_SIDE_PARTY_LABELS
        : REQUEST_SIDE_PARTY_LABELS;
}

function pickPrimaryPartySection(manifest: TemplateManifest, parsed: ParsedPleadingStructure): string {
    if (manifest.documentKind === 'third_party_statement') {
        return parsed.thirdPartySection;
    }
    return manifest.orientation === 'response'
        ? parsed.defendantSection
        : parsed.plaintiffSection;
}

function extractPartySegment(text: string, labels: string[]): string {
    if (!text) {
        return '';
    }

    const labelsPattern = labels.map(escapeRegExp).join('|');
    const allLabelsPattern = ALL_OUTPUT_PARTY_LABELS.map(escapeRegExp).join('|');
    const matcher = new RegExp(
        `(?:${labelsPattern})(?:（[^）]*）|\\([^)]*\\))?[：:]\\s*([\\s\\S]*?)(?=(?:${allLabelsPattern})(?:（[^）]*）|\\([^)]*\\))?[：:]|$)`,
        'u',
    );
    return text.match(matcher)?.[1]?.trim() ?? '';
}

function extractPartyNameCandidate(text: string, labels: string[]): string {
    if (!text) {
        return '';
    }

    const labelsPattern = labels.map(escapeRegExp).join('|');
    const allLabelsPattern = ALL_OUTPUT_PARTY_LABELS.map(escapeRegExp).join('|');
    const lines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    let candidate = extractPartySegment(text, labels);

    if (!candidate) {
        candidate = lines[0] ?? '';
        if (!candidate) {
            return '';
        }

        const leadingRoleMatcher = new RegExp(
            `^(?:${labelsPattern})(?:（[^）]*）|\\([^)]*\\))?[：:]?\\s*`,
            'u',
        );
        candidate = candidate.replace(leadingRoleMatcher, '').trim();
    }

    if (!candidate) {
        return '';
    }

    candidate = candidate
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)[0] ?? candidate;

    candidate = candidate.replace(/^(?:\u59d3\u540d|\u540d\u79f0)[：:]?\s*/u, '').trim();

    const nextPartyIndex = candidate.search(
        new RegExp(`\\s*(?:${allLabelsPattern})(?:（[^）]*）|\\([^)]*\\))?[：:]`, 'u'),
    );
    if (nextPartyIndex > 0) {
        candidate = candidate.slice(0, nextPartyIndex).trim();
    }

    let cutIndex = candidate.length;
    for (const marker of PARTY_DETAIL_STOP_MARKERS) {
        const markerIndex = candidate.indexOf(marker);
        if (markerIndex > 0 && markerIndex < cutIndex) {
            cutIndex = markerIndex;
        }
    }

    const punctuationIndex = candidate.search(/[，,。；;]/u);
    if (punctuationIndex > 0 && punctuationIndex < cutIndex) {
        cutIndex = punctuationIndex;
    }

    return candidate.slice(0, cutIndex).trim();
}

function extractOutputSubject(manifest: TemplateManifest, parsed: ParsedPleadingStructure): string {
    const labels = pickOutputPartyLabels(manifest);
    const sources = [
        pickPrimaryPartySection(manifest, parsed),
        parsed.partySections,
        parsed.rawContent,
    ];

    for (const source of sources) {
        const candidate = extractPartyNameCandidate(source, labels);
        if (candidate) {
            return sanitizeOutputFileSegment(candidate, '\u4e3b\u4f53');
        }
    }

    const signer = extractClosingValue(parsed.closingSection, 'signer');
    return sanitizeOutputFileSegment(signer, '\u4e3b\u4f53');
}

function buildOutputFileName(manifest: TemplateManifest, parsed: ParsedPleadingStructure): string {
    const subject = extractOutputSubject(manifest, parsed);
    const caseTitle = sanitizeOutputFileSegment(
        manifest.caseTitle || manifest.categoryLabel || '\u6848\u7531',
        '\u6848\u7531',
    );
    const documentTitle = sanitizeOutputFileSegment(
        manifest.documentTitle || manifest.label || manifest.fileNamePrefix || '\u6587\u4e66',
        '\u6587\u4e66',
    );
    const today = buildOutputDateSuffix();
    return `${subject}-${caseTitle}-${documentTitle}-${today}.docx`;
}

export async function generateElementComplaint(
    provider: AIProvider,
    content: string,
): Promise<ElementComplaintResponse> {
    const parsed = parseComplaintStructure(content);
    const detection = detectComplaintCaseType(parsed.normalizedText || content);
    const template = getComplaintTemplate(detection.caseType);

    const systemPrompt = buildElementComplaintSystemPrompt();
    const userPrompt = buildElementComplaintUserPrompt(template, parsed, detection);
    const responseText = await provider.chat(
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
    );

    const rawJson = parseJsonObject(responseText);
    const extraction = normalizeExtractionResult(rawJson, template, parsed.warnings);
    const renderModel = buildRenderModel(template, parsed, extraction);
    const warnings = mergeWarnings(
        parsed.warnings,
        detection.warnings,
        extraction.warnings,
        buildMissingFieldWarnings(template, extraction),
    );

    const confidence: ComplaintConfidence = detection.confidence;

    return {
        detectedCaseType: mapCaseTypeLabel(template.caseType),
        confidence,
        renderModel,
        warnings,
    };
}

export async function generateElementPleadingDocx(
    provider: AIProvider,
    content: string,
    templateId: string,
): Promise<ElementPleadingDocxResponse> {
    const manifest = loadTemplateManifestById(templateId);
    const parsed = parsePleadingStructure(content, manifest.orientation);
    const systemPrompt = buildElementPleadingSystemPrompt(manifest);
    const userPrompt = buildElementPleadingUserPrompt(manifest, parsed);

    const responseText = await provider.chat(
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
    );

    const rawJson = parseJsonObject(responseText);
    const extraction = normalizePleadingExtractionResult(rawJson, manifest, parsed.warnings);
    extraction.values = sanitizeExtractedValues(manifest, parsed, extraction.values);
    extraction.values = applyHeuristicFallbacks(manifest, parsed, extraction.values);
    extraction.values = sanitizeExtractedValues(manifest, parsed, extraction.values);
    const warnings = buildElementPleadingWarnings(manifest, extraction);
    let renderedDocx = renderTemplateDocx(manifest, extraction.values, {
        requestOrResponseText: manifest.orientation === 'response'
            ? stripSectionHeading(parsed.requestOrResponseSection, ['答辩意见', '答辩请求', '答辩事项', '答辩理由', '陈述意见'])
            : stripSectionHeading(parsed.requestOrResponseSection, ['诉讼请求', '请求事项', '申请事项', '申请请求', '异议请求', '赔偿请求', '执行请求']),
        factText: stripSectionHeading(parsed.factSection, ['事实与理由', '事实和理由', '申请理由', '异议理由', '主要事实与理由', '理由']),
    });
    const unreplacedTokens = findUnreplacedTokensInDocx(renderedDocx);

    if (unreplacedTokens.length > 0) {
        renderedDocx = clearUnreplacedTokensInDocx(renderedDocx);
        warnings.push(`模板中有未替换的占位符，已按空白处理：${unreplacedTokens.join('、')}`);
    }

    const outputFileName = buildOutputFileName(manifest, parsed);

    return {
        fileName: outputFileName,
        docxBase64: renderedDocx.toString('base64'),
        warnings,
    };
}
