import type { ComplaintDetectionResult } from './types';
import type { ParsedPleadingStructure, TemplateManifest } from './types';
import type { ComplaintTemplateDefinition } from './types';

function buildFieldCatalog(manifest: TemplateManifest): Array<{
    key: string;
    label: string;
    blockTitle: string;
    sourceSection: string;
    required: boolean;
    multiline: boolean;
    hint?: string;
}> {
    return manifest.fields.map((field) => ({
        key: field.key,
        label: field.label,
        blockTitle: field.blockTitle,
        sourceSection: field.sourceSection,
        required: field.required,
        multiline: field.multiline,
        ...(field.hint ? { hint: field.hint } : {}),
    }));
}

function buildSchemaExample(manifest: TemplateManifest): string {
    const example: { values: Record<string, string>; warnings: string[] } = {
        values: {},
        warnings: [],
    };
    for (const field of manifest.fields) {
        example.values[field.key] = '';
    }
    return JSON.stringify(example, null, 2);
}

function formatSection(title: string, text: string): string {
    return `【${title}】\n${text || '（未识别）'}`;
}

export function buildElementPleadingSystemPrompt(manifest: TemplateManifest): string {
    const role = manifest.documentTitle || manifest.label;
    let kindGuidance = '申请书、起诉状、自诉状等文书中请重点识别当事人信息、请求事项、事实与理由和尾部签署信息。';

    if (manifest.documentKind === 'third_party_statement') {
        kindGuidance = '第三人意见陈述书请重点识别第三人身份、陈述意见、对原被告诉求的赞同或异议，以及对应事实理由和签署信息。';
    } else if (manifest.documentKind === 'evidence_list') {
        kindGuidance = '证据清单或证据目录请重点识别证据名称、证据形式、来源、证明目的、页数页码、提交人和提交时间等信息。';
    } else if (manifest.documentKind === 'cross_examination') {
        kindGuidance = '质证意见表请重点识别针对各项证据的真实性、合法性、关联性意见，以及综合质证结论。';
    } else if (manifest.documentKind === 'analysis_table') {
        kindGuidance = '分析表请重点识别技术特征对比、现有技术比对、专利有效性分析等结构化内容，尽量按模板栏位提炼。';
    } else if (manifest.documentKind === 'info_table') {
        kindGuidance = '信息表请重点识别关联行政程序、行政诉讼案件、同族专利、程序进展等结构化信息。';
    } else if (manifest.orientation === 'response') {
        kindGuidance = '答辩状中请重点识别答辩事项、对原告诉求的确认或异议、以及对应事实与理由。';
    }

    return [
        `你是中国${role}结构化字段提取器。`,
        '你的唯一任务是从用户提供的现有文书中识别字段内容，并返回严格 JSON。',
        '禁止输出 Markdown、代码块、解释、前后缀说明。',
        '不要编造事实，不要补充法律分析，不要改写为新的完整文书。',
        '如果某个字段无法从原文稳定提取，返回空字符串。',
        '输出 JSON 必须只包含 values 和 warnings 两个字段。',
        'values 的 key 必须与提供的字段目录完全一致，且所有值都必须是字符串。',
        kindGuidance,
    ].join('\n');
}

export function buildElementPleadingUserPrompt(
    manifest: TemplateManifest,
    structure: ParsedPleadingStructure,
): string {
    return [
        `文书模板：${manifest.label}`,
        '',
        '请根据下面的现有文书内容，提取并填写字段目录中的各项内容。',
        '要求：',
        '1. 只使用原文中明确出现或可直接判断的内容。',
        '2. 多行内容使用换行符分隔，保持原文顺序。',
        '3. 对于模板中的复选/确认类字段，请尽量沿用模板里的选项原词作答，并补充必要说明。',
        '4. 无法识别时返回空字符串，并在 warnings 中简短说明。',
        '5. 如果原文已能支持概括提炼，请优先提炼成适合直接填入模板单元格的完整短句，不要因为原文标题和栏目名不一致就直接留空。',
        '6. 对于“合同签订情况”“请求依据”“证据清单”等栏目，需要综合诉请、事实理由、证据部分和完整原文一起判断。',
        '7. 对于“其他需要说明”“是否了解调解”“是否考虑先行调解”等栏目，如果原文没有明确表述，必须留空，不能挪用诉讼请求、事实理由、证据或落款内容。',
        '8. 对于“担保人、担保物”这类栏目，只有原文明确写到担保人、保证人、抵押物、质押物等内容时才能填写。',
        '',
        '【字段目录】',
        JSON.stringify(buildFieldCatalog(manifest), null, 2),
        '',
        formatSection('法院', structure.court),
        '',
        formatSection('当事人信息', structure.partySections),
        '',
        formatSection('诉请或答辩事项', structure.requestOrResponseSection),
        '',
        formatSection('事实与理由', structure.factSection),
        '',
        formatSection('证据', structure.evidenceSection),
        '',
        formatSection('落款', structure.closingSection),
        '',
        formatSection('完整原文', structure.rawContent),
        '',
        '【输出 JSON 示例】',
        buildSchemaExample(manifest),
    ].join('\n');
}

export function buildElementComplaintSystemPrompt(): string {
    return [
        '你是中国民事起诉状要素化结构提取器。',
        '你必须只输出一个严格的 JSON 对象，不要输出 Markdown、解释或代码块。',
        '如果某个字段无法从原文稳定确定，请输出空字符串。',
        '不要编造事实，不要扩写，不要加入法律分析。',
        '输出 JSON 必须包含 court、values、warnings 三个字段。',
        'values 的 key 必须与字段目录完全一致。',
    ].join('\n');
}

export function buildElementComplaintUserPrompt(
    template: ComplaintTemplateDefinition,
    structure: ParsedPleadingStructure,
    detection: ComplaintDetectionResult,
): string {
    const fields: Array<{ key: string; label: string; hint?: string; blockTitle: string }> = [];
    for (const block of template.blocks) {
        if (block.type === 'paragraph') {
            continue;
        }
        for (const row of block.rows) {
            fields.push({
                key: row.key,
                label: row.label,
                blockTitle: block.title,
                ...(row.hint ? { hint: row.hint } : {}),
            });
        }
    }

    const example: { court: string; values: Record<string, string>; warnings: string[] } = {
        court: structure.court || 'XX人民法院',
        values: {},
        warnings: [],
    };
    for (const field of fields) {
        example.values[field.key] = '';
    }

    return [
        `案由识别结果：${detection.label}（confidence=${detection.confidence}）`,
        '请从下列起诉状中提取模板字段，并返回严格 JSON。',
        '',
        '【字段目录】',
        JSON.stringify(fields, null, 2),
        '',
        formatSection('法院', structure.court),
        '',
        formatSection('当事人信息', structure.partySections),
        '',
        formatSection('诉讼请求', structure.requestOrResponseSection),
        '',
        formatSection('事实与理由', structure.factSection),
        '',
        formatSection('完整原文', structure.rawContent),
        '',
        '【输出 JSON 示例】',
        JSON.stringify(example, null, 2),
    ].join('\n');
}
