import type { ParsedPleadingStructure, PleadingOrientation } from './types';

function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\u00a0/g, ' ')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .trim();
}

function buildHeadingMatcher(pattern: RegExp): (line: string) => boolean {
    return (line: string) => pattern.test(line.trim());
}

function findFirstLineIndex(lines: string[], matcher: (line: string) => boolean): number {
    for (let index = 0; index < lines.length; index += 1) {
        if (matcher(lines[index] ?? '')) {
            return index;
        }
    }
    return -1;
}

function collectSection(
    lines: string[],
    startMatchers: Array<(line: string) => boolean>,
    endMatchers: Array<(line: string) => boolean>,
): string {
    const startIndex = startMatchers
        .map((matcher) => findFirstLineIndex(lines, matcher))
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0] ?? -1;

    if (startIndex < 0) {
        return '';
    }

    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (endMatchers.some((matcher) => matcher(line))) {
            endIndex = index;
            break;
        }
    }

    return lines.slice(startIndex, endIndex).join('\n').trim();
}

function extractCourt(normalizedText: string): string {
    const matches = normalizedText.match(/(?:^|\n)\s*([^\n]{2,80}?人民法院)\s*(?:\n|$)/u);
    if (!matches) {
        return '';
    }
    return (matches[1] ?? '').trim();
}

const COMMON_REQUEST_START_MATCHERS = [
    buildHeadingMatcher(/^诉讼请求[：:]/u),
    buildHeadingMatcher(/^请求事项[：:]/u),
    buildHeadingMatcher(/^申请事项[：:]/u),
    buildHeadingMatcher(/^申请请求[：:]/u),
    buildHeadingMatcher(/^异议请求[：:]/u),
    buildHeadingMatcher(/^赔偿请求[：:]/u),
    buildHeadingMatcher(/^执行请求[：:]/u),
];

const COMMON_RESPONSE_START_MATCHERS = [
    buildHeadingMatcher(/^答辩意见[：:]/u),
    buildHeadingMatcher(/^答辩请求[：:]/u),
    buildHeadingMatcher(/^答辩事项[：:]/u),
    buildHeadingMatcher(/^答辩理由[：:]/u),
    buildHeadingMatcher(/^陈述意见[：:]/u),
];

const COMMON_FACT_START_MATCHERS = [
    buildHeadingMatcher(/^事实[与和]理由[：:]/u),
    buildHeadingMatcher(/^事实和理由[：:]/u),
    buildHeadingMatcher(/^申请理由[：:]/u),
    buildHeadingMatcher(/^异议理由[：:]/u),
    buildHeadingMatcher(/^主要事实与理由[：:]/u),
    buildHeadingMatcher(/^理由[：:]/u),
];

const PARTY_HEADING_MATCHERS = [
    buildHeadingMatcher(/^原告[：:]/u),
    buildHeadingMatcher(/^被告[：:]/u),
    buildHeadingMatcher(/^第三人[：:]/u),
    buildHeadingMatcher(/^申请人[：:]/u),
    buildHeadingMatcher(/^被申请人[：:]/u),
    buildHeadingMatcher(/^自诉人[：:]/u),
    buildHeadingMatcher(/^被告人[：:]/u),
    buildHeadingMatcher(/^答辩人[：:]/u),
    buildHeadingMatcher(/^被答辩人[：:]/u),
    buildHeadingMatcher(/^赔偿请求人[：:]/u),
    buildHeadingMatcher(/^赔偿义务机关[：:]/u),
    buildHeadingMatcher(/^申请执行人[：:]/u),
    buildHeadingMatcher(/^被执行人[：:]/u),
    buildHeadingMatcher(/^异议人[：:]/u),
    buildHeadingMatcher(/^案外人[：:]/u),
    buildHeadingMatcher(/^利害关系人[：:]/u),
];

function buildPartyMatchers(orientation: PleadingOrientation): {
    plaintiffMatchers: Array<(line: string) => boolean>;
    defendantMatchers: Array<(line: string) => boolean>;
} {
    if (orientation === 'response') {
        return {
            plaintiffMatchers: [
                buildHeadingMatcher(/^被答辩人[：:]/u),
                buildHeadingMatcher(/^原告[：:]/u),
                buildHeadingMatcher(/^被告人[：:]/u),
                buildHeadingMatcher(/^赔偿请求人[：:]/u),
                buildHeadingMatcher(/^申请人[：:]/u),
                buildHeadingMatcher(/^申请执行人[：:]/u),
            ],
            defendantMatchers: [
                buildHeadingMatcher(/^答辩人[：:]/u),
                buildHeadingMatcher(/^被告[：:]/u),
                buildHeadingMatcher(/^被申请人[：:]/u),
                buildHeadingMatcher(/^赔偿义务机关[：:]/u),
                buildHeadingMatcher(/^被执行人[：:]/u),
            ],
        };
    }

    return {
        plaintiffMatchers: [
            buildHeadingMatcher(/^原告[：:]/u),
            buildHeadingMatcher(/^申请人[：:]/u),
            buildHeadingMatcher(/^自诉人[：:]/u),
            buildHeadingMatcher(/^赔偿请求人[：:]/u),
            buildHeadingMatcher(/^申请执行人[：:]/u),
            buildHeadingMatcher(/^异议人[：:]/u),
            buildHeadingMatcher(/^案外人[：:]/u),
            buildHeadingMatcher(/^利害关系人[：:]/u),
        ],
        defendantMatchers: [
            buildHeadingMatcher(/^被告[：:]/u),
            buildHeadingMatcher(/^被申请人[：:]/u),
            buildHeadingMatcher(/^被告人[：:]/u),
            buildHeadingMatcher(/^赔偿义务机关[：:]/u),
            buildHeadingMatcher(/^被执行人[：:]/u),
        ],
    };
}

export function parsePleadingStructure(rawText: string, orientation: PleadingOrientation): ParsedPleadingStructure {
    const normalizedText = normalizeText(rawText);
    const lines = normalizedText ? normalizedText.split('\n') : [];
    const warnings: string[] = [];

    if (!normalizedText) {
        warnings.push('输入内容为空或无法识别。');
    }

    if (normalizedText.length < 20) {
        warnings.push('输入文本过短，可能不足以稳定识别文书结构。');
    }

    const court = extractCourt(normalizedText);
    const { plaintiffMatchers, defendantMatchers } = buildPartyMatchers(orientation);
    const requestMatchers = orientation === 'response' ? COMMON_RESPONSE_START_MATCHERS : COMMON_REQUEST_START_MATCHERS;

    const commonEndMatchers = [
        ...PARTY_HEADING_MATCHERS,
        ...COMMON_REQUEST_START_MATCHERS,
        ...COMMON_RESPONSE_START_MATCHERS,
        ...COMMON_FACT_START_MATCHERS,
        buildHeadingMatcher(/^证据清单?[：:]/u),
        buildHeadingMatcher(/^证据目录[：:]/u),
        buildHeadingMatcher(/^证据[：:]/u),
        buildHeadingMatcher(/^此致/u),
        buildHeadingMatcher(/^(具状人|答辩人|申请人|赔偿请求人|申请执行人)[（(]签字/u),
        buildHeadingMatcher(/^日期[：:]/u),
    ];

    const plaintiffText = collectSection(lines, plaintiffMatchers, commonEndMatchers);
    const defendantText = collectSection(lines, defendantMatchers, commonEndMatchers);
    const thirdPartyText = collectSection(
        lines,
        [buildHeadingMatcher(/^第三人[：:]/u)],
        commonEndMatchers,
    );

    const requestOrResponseSection = collectSection(
        lines,
        requestMatchers,
        [
            ...COMMON_FACT_START_MATCHERS,
            buildHeadingMatcher(/^证据清单?[：:]/u),
            buildHeadingMatcher(/^证据目录[：:]/u),
            buildHeadingMatcher(/^证据[：:]/u),
            buildHeadingMatcher(/^此致/u),
            buildHeadingMatcher(/^(具状人|答辩人|申请人|赔偿请求人|申请执行人)[（(]签字/u),
            buildHeadingMatcher(/^日期[：:]/u),
        ],
    );

    const factSection = collectSection(
        lines,
        COMMON_FACT_START_MATCHERS,
        [
            buildHeadingMatcher(/^证据清单?[：:]/u),
            buildHeadingMatcher(/^证据目录[：:]/u),
            buildHeadingMatcher(/^证据[：:]/u),
            buildHeadingMatcher(/^此致/u),
            buildHeadingMatcher(/^(具状人|答辩人|申请人|赔偿请求人|申请执行人)[（(]签字/u),
            buildHeadingMatcher(/^日期[：:]/u),
        ],
    );

    const evidenceSection = collectSection(
        lines,
        [
            buildHeadingMatcher(/^证据和证据来源[，,]?证人姓名和住所[：:]/u),
            buildHeadingMatcher(/^证据清单?[：:]/u),
            buildHeadingMatcher(/^证据目录[：:]/u),
            buildHeadingMatcher(/^证据[：:]/u),
        ],
        [
            buildHeadingMatcher(/^此致/u),
            buildHeadingMatcher(/^具状人[：:]/u),
            buildHeadingMatcher(/^答辩人[：:]/u),
            buildHeadingMatcher(/^申请人[：:]/u),
            buildHeadingMatcher(/^赔偿请求人[：:]/u),
            buildHeadingMatcher(/^申请执行人[：:]/u),
            buildHeadingMatcher(/^日期[：:]/u),
        ],
    );

    const closingSection = collectSection(
        lines,
        [
            buildHeadingMatcher(/^此致/u),
            buildHeadingMatcher(/^具状人[：:]/u),
            buildHeadingMatcher(/^答辩人[：:]/u),
            buildHeadingMatcher(/^申请人[：:]/u),
            buildHeadingMatcher(/^赔偿请求人[：:]/u),
            buildHeadingMatcher(/^申请执行人[：:]/u),
        ],
        [],
    );

    const partySections = [plaintiffText, defendantText, thirdPartyText]
        .filter(Boolean)
        .join('\n\n');

    if (!court) {
        warnings.push('未能稳定识别法院名称。');
    }

    if (!plaintiffText) {
        warnings.push(orientation === 'response' ? '未能识别被答辩人或相对方信息段。' : '未能识别申请人、原告或自诉人信息段。');
    }

    if (!defendantText) {
        warnings.push(orientation === 'response' ? '未能识别答辩人或义务方信息段。' : '未能识别被告、被申请人或被执行人信息段。');
    }

    if (!requestOrResponseSection) {
        warnings.push(orientation === 'response' ? '未能识别答辩意见、答辩请求或陈述意见段。' : '未能识别诉讼请求、申请事项或异议请求段。');
    }

    if (!factSection) {
        warnings.push('未能识别事实与理由、申请理由或异议理由段。');
    }

    return {
        rawText,
        normalizedText,
        court,
        plaintiffSection: plaintiffText,
        defendantSection: defendantText,
        thirdPartySection: thirdPartyText,
        partySections,
        requestOrResponseSection,
        factSection,
        evidenceSection,
        closingSection,
        rawContent: normalizedText,
        warnings,
    };
}

export function parseComplaintStructure(rawText: string): ParsedPleadingStructure {
    return parsePleadingStructure(rawText, 'request');
}
