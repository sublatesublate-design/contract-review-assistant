import assert from 'node:assert/strict';
import test from 'node:test';
import PizZip from 'pizzip';
import type { AIProvider, ChatMessageParam } from '../ai/types';
import { parsePleadingStructure } from './parser';
import { loadTemplateCatalog, loadTemplateManifestById, readTemplateAsset } from './templateAssets';
import { clearUnreplacedTokensInDocx, findUnreplacedTokensInDocx, renderTemplateDocx } from './templateRenderer';
import { generateElementComplaint, generateElementPleadingDocx } from './service';
import type { TemplateManifest } from './types';

class FakeProvider implements AIProvider {
    readonly name = 'fake';
    readonly model = 'fake-model';

    constructor(private readonly response: string) {}

    async chat(_messages: ChatMessageParam[], _systemPrompt?: string): Promise<string> {
        return this.response;
    }

    async chatStream(): Promise<void> {
        throw new Error('not implemented');
    }
}

const COMPLAINT_SAMPLE = `
北京市朝阳区人民法院

原告：张三，男，1990年1月5日出生，住北京市朝阳区。
被告：李四，男，1988年1月10日出生，住北京市海淀区。
诉讼请求：
1. 依法判令被告向原告偿还借款本金人民币500000元；
2. 依法判令被告支付自2024年1月6日起至实际清偿之日止的利息；
3. 依法判令被告承担本案诉讼费用。
事实与理由：
2023年1月5日，原告与被告签订借款协议，约定原告向被告出借500000元，并于2024年1月5日前归还。
原告当日已通过银行转账向被告支付全部借款，被告到期后未依约还款。
证据：
1. 借款协议；
2. 银行转账记录；
3. 还款承诺书。
此致
北京市朝阳区人民法院
具状人（签字、盖章）：张三
日期：2026年3月2日
`.trim();

const DEFENSE_SAMPLE = `
北京市朝阳区人民法院

答辩人：李四，男，1988年1月10日出生，住北京市海淀区。
被答辩人：张三，男，1990年1月5日出生，住北京市朝阳区。
答辩意见：
1. 对原告主张的借款本金数额提出异议；
2. 对原告主张的利息标准提出异议；
3. 请求依法驳回原告明显过高部分的诉讼请求。
事实与理由：
答辩人与被答辩人之间确有资金往来，但实际借款本金并非500000元，且部分款项已经归还。
证据：
1. 还款转账记录；
2. 微信聊天记录；
3. 账目明细。
此致
北京市朝阳区人民法院
答辩人（签字、盖章）：李四
日期：2026年3月2日
`.trim();

function collectTemplateTokens(buffer: Buffer): string[] {
    const zip = new PizZip(buffer);
    const tokens = new Set<string>();

    for (const file of zip.file(/word\/.+\.xml$/)) {
        if (file.name.startsWith('word/_rels/')) {
            continue;
        }
        const xml = file.asText();
        for (const token of xml.match(/{{[^{}]+}}/g) ?? []) {
            tokens.add(token);
        }
    }

    return [...tokens].sort();
}

function countTopLevelTables(buffer: Buffer): number {
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    const body = xml.match(/<w:body>([\s\S]*?)<\/w:body>/)?.[1] ?? '';

    let cursor = 0;
    let count = 0;

    while (cursor < body.length) {
        const paragraphIndex = body.indexOf('<w:p', cursor);
        const tableIndex = body.indexOf('<w:tbl', cursor);
        const sectionIndex = body.indexOf('<w:sectPr', cursor);
        const nextIndex = [paragraphIndex, tableIndex, sectionIndex]
            .filter((index) => index >= 0)
            .sort((left, right) => left - right)[0];

        if (nextIndex == null) {
            break;
        }

        cursor = nextIndex;
        if (body.startsWith('<w:p', cursor)) {
            const end = body.indexOf('</w:p>', cursor);
            cursor = end >= 0 ? end + '</w:p>'.length : cursor + 1;
            continue;
        }

        if (body.startsWith('<w:tbl', cursor)) {
            const end = body.indexOf('</w:tbl>', cursor);
            count += 1;
            cursor = end >= 0 ? end + '</w:tbl>'.length : cursor + 1;
            continue;
        }

        if (body.startsWith('<w:sectPr', cursor)) {
            const end = body.indexOf('</w:sectPr>', cursor);
            cursor = end >= 0 ? end + '</w:sectPr>'.length : cursor + 1;
            continue;
        }
    }

    return count;
}

function countSections(buffer: Buffer): number {
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    return (xml.match(/<w:sectPr\b/g) ?? []).length;
}

function extractFirstTableProperties(buffer: Buffer): {
    alignment: string | null;
    indent: number | null;
    indentType: string | null;
} {
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    const tblPr = xml.match(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/)?.[1] ?? '';
    const alignment = tblPr.match(/<w:jc\b[^>]*w:val="([^"]+)"/)?.[1] ?? null;
    const indentMatch = tblPr.match(/<w:tblInd\b[^>]*w:w="(-?\d+)"[^>]*w:type="([^"]+)"/);

    return {
        alignment,
        indent: indentMatch ? Number(indentMatch[1]) : null,
        indentType: indentMatch?.[2] ?? null,
    };
}

function buildFilledValues(
    manifest: TemplateManifest,
    overrides: Record<string, string> = {},
): Record<string, string> {
    return Object.fromEntries(
        manifest.fields.map((field, index) => [
            field.key,
            overrides[field.key] ?? (field.multiline ? `字段${index + 1}第一行\n字段${index + 1}第二行` : `字段${index + 1}`),
        ]),
    );
}

test('parsePleadingStructure extracts request and response sections', () => {
    const complaint = parsePleadingStructure(COMPLAINT_SAMPLE, 'request');
    const defense = parsePleadingStructure(DEFENSE_SAMPLE, 'response');

    assert.equal(complaint.court, '北京市朝阳区人民法院');
    assert.match(complaint.partySections, /原告：张三/);
    assert.match(complaint.requestOrResponseSection, /诉讼请求/);
    assert.match(complaint.factSection, /事实与理由/);

    assert.equal(defense.court, '北京市朝阳区人民法院');
    assert.match(defense.partySections, /答辩人：李四/);
    assert.match(defense.requestOrResponseSection, /答辩意见/);
    assert.match(defense.factSection, /事实与理由/);
});

test('official template catalog is grouped by nine categories', () => {
    const catalog = loadTemplateCatalog();
    const total = catalog.reduce((sum, category) => sum + category.items.length, 0);

    assert.equal(catalog.length, 9);
    assert.equal(total, 113);
    assert.deepEqual(
        catalog.map((category) => category.id),
        [
            'criminal_private',
            'civil',
            'commercial',
            'intellectual_property',
            'maritime',
            'administrative',
            'environment_resources',
            'state_compensation',
            'enforcement',
        ],
    );
});

test('all third-party statements stay under intellectual property', () => {
    const thirdPartyItems = loadTemplateCatalog()
        .flatMap((category) => category.items)
        .filter((item) => item.documentKind === 'third_party_statement');

    assert.equal(thirdPartyItems.length, 3);
    assert.ok(thirdPartyItems.every((item) => item.categoryId === 'intellectual_property'));
});

test('every generated template matches its manifest and stays a single centered table', () => {
    const catalog = loadTemplateCatalog();

    for (const item of catalog.flatMap((category) => category.items)) {
        const manifest = loadTemplateManifestById(item.templateId);
        const buffer = readTemplateAsset(manifest.templateFile);
        const tokens = collectTemplateTokens(buffer);
        const expectedTokens = manifest.fields.map((field) => `{{${field.key}}}`).sort();
        const tableProps = extractFirstTableProperties(buffer);

        assert.deepEqual(tokens, expectedTokens, `${item.templateId} placeholder mismatch`);
        assert.equal(countSections(buffer), 1, `${item.templateId} should keep one effective section`);
        assert.equal(countTopLevelTables(buffer), 1, `${item.templateId} should keep one top-level table`);
        assert.equal(tableProps.alignment, 'center', `${item.templateId} should keep the top-level table centered`);
        assert.equal(tableProps.indent, 0, `${item.templateId} should keep zero top-level table indent`);
        assert.equal(tableProps.indentType, 'dxa', `${item.templateId} should keep an explicit zero table indent`);
    }
});

test('main pleading templates with summary instruction rows keep full-text placeholders', () => {
    const catalog = loadTemplateCatalog();

    for (const item of catalog.flatMap((category) => category.items)) {
        if (item.documentKind !== 'main_pleading' && item.documentKind !== 'third_party_statement') {
            continue;
        }

        const manifest = loadTemplateManifestById(item.templateId);
        const template = readTemplateAsset(manifest.templateFile);
        const xml = new PizZip(template).file('word/document.xml')?.asText() ?? '';
        const hasSummaryInstructionRow = xml.includes('（可完整表述');

        if (!hasSummaryInstructionRow) {
            continue;
        }

        const requestOrResponseFullText = manifest.fields.some((field) => (
            /全文/u.test(field.label)
            && /(诉讼请求|请求事项|申请事项|申请请求|答辩意见|答辩请求|答辩事项|答辩理由|陈述意见|赔偿请求|执行请求|异议请求)/u.test(field.label)
        ));
        const factFullText = manifest.fields.some((field) => (
            /全文/u.test(field.label)
            && /(事实与理由|事实和理由|申请理由|异议理由|主要事实与理由|理由)/u.test(field.label)
        ));
        const hasRequestSummaryInstruction = /(请概况描述|请概括描述)[^<]{0,40}(诉讼请求|请求事项|申请事项|申请请求|答辩意见|答辩请求|答辩事项|答辩理由|陈述意见|赔偿请求|执行请求|异议请求)/u.test(xml);
        const hasFactSummaryInstruction = /(可完整表述|请概况描述|请概括描述)[^<]{0,60}(事实与理由|事实和理由|申请理由|异议理由|主要事实与理由|理由)/u.test(xml);

        if (hasRequestSummaryInstruction) {
            assert.ok(requestOrResponseFullText, `${item.templateId} should keep an explicit request or response full-text placeholder`);
        }

        if (hasFactSummaryInstruction) {
            assert.ok(factFullText, `${item.templateId} should keep an explicit fact full-text placeholder`);
        }
    }
});

test('renderTemplateDocx escapes XML and keeps the top-level table centered', () => {
    const manifest = loadTemplateManifestById('civil_001');
    const multilineField = manifest.fields.find((field) => field.multiline);
    assert.ok(multilineField, 'expected a multiline field');

    const rendered = renderTemplateDocx(
        manifest,
        buildFilledValues(manifest, {
            [multilineField.key]: '当事人 & <测试>\n第二行 "引号" 与 \'单引号\'',
        }),
    );

    const xml = new PizZip(rendered).file('word/document.xml')?.asText() ?? '';
    const tableProps = extractFirstTableProperties(rendered);

    assert.match(xml, /&amp;/);
    assert.match(xml, /&lt;测试&gt;/);
    assert.match(xml, /&quot;引号&quot;/);
    assert.match(xml, /&apos;单引号&apos;/);
    assert.match(xml, /<w:br\/>/);
    assert.deepEqual(findUnreplacedTokensInDocx(rendered), []);
    assert.equal(tableProps.alignment, 'center');
    assert.equal(tableProps.indent, 0);
});

test('renderTemplateDocx marks simple checkbox selections in the template cell', () => {
    const manifest = loadTemplateManifestById('civil_003');
    const rendered = renderTemplateDocx(manifest, {
        ...buildFilledValues(manifest),
        field_017: '是',
        field_032: '暂不确定，想要了解更多内容',
    });
    const xml = new PizZip(rendered).file('word/document.xml')?.asText() ?? '';

    assert.match(xml, /是☑/);
    assert.match(xml, /否☐/);
    assert.match(xml, /暂不确定，想要了解更多内容☑/);
});

test('renderTemplateDocx keeps checkbox details when extra explanation exists', () => {
    const manifest = loadTemplateManifestById('civil_003');
    const rendered = renderTemplateDocx(manifest, {
        ...buildFilledValues(manifest),
        field_019: '是 保全法院：北京市朝阳区人民法院 保全时间：2026年3月2日 保全案号：(2026)京0105财保1号',
    });
    const xml = new PizZip(rendered).file('word/document.xml')?.asText() ?? '';

    assert.match(xml, /是☑/);
    assert.match(xml, /否☐/);
    assert.match(xml, /保全法院：北京市朝阳区人民法院/);
    assert.match(xml, /保全案号/);
});

test('clearUnreplacedTokensInDocx removes leftover placeholders from generated documents', () => {
    const manifest = loadTemplateManifestById('civil_001');
    const templateBuffer = readTemplateAsset(manifest.templateFile);
    const cleaned = clearUnreplacedTokensInDocx(templateBuffer);

    assert.notDeepEqual(findUnreplacedTokensInDocx(templateBuffer), []);
    assert.deepEqual(findUnreplacedTokensInDocx(cleaned), []);
});

test('generateElementPleadingDocx renders a valid official template from templateId', async () => {
    const manifest = loadTemplateManifestById('civil_001');
    const provider = new FakeProvider(JSON.stringify({
        values: Object.fromEntries(manifest.fields.map((field) => [field.key, ''])),
        warnings: ['模型未稳定提取全部字段'],
    }));

    const result = await generateElementPleadingDocx(provider, COMPLAINT_SAMPLE, 'civil_001');
    const rendered = Buffer.from(result.docxBase64, 'base64');
    const xml = new PizZip(rendered).file('word/document.xml')?.asText() ?? '';
    const tableProps = extractFirstTableProperties(rendered);

    assert.match(result.fileName, /^\u5f20\u4e09-\u79bb\u5a5a\u7ea0\u7eb7-\u6c11\u4e8b\u8d77\u8bc9\u72b6-\d{8}\.docx$/u);
    assert.ok(result.warnings.length > 0);
    assert.match(xml, /诉讼请求|请求事项/);
    assert.match(xml, /事实与理由|理由/);
    assert.deepEqual(findUnreplacedTokensInDocx(rendered), []);
    assert.equal(tableProps.alignment, 'center');
    assert.equal(tableProps.indent, 0);
});

test('generateElementPleadingDocx uses the answering party in response document file names', async () => {
    const manifest = loadTemplateManifestById('civil_002');
    const provider = new FakeProvider(JSON.stringify({
        values: Object.fromEntries(manifest.fields.map((field) => [field.key, ''])),
        warnings: [],
    }));

    const result = await generateElementPleadingDocx(provider, DEFENSE_SAMPLE, 'civil_002');
    assert.match(result.fileName, /^\u674e\u56db-\u79bb\u5a5a\u7ea0\u7eb7-\u6c11\u4e8b\u7b54\u8fa9\u72b6-\d{8}\.docx$/u);
});

test('legacy element-complaint flow remains callable', async () => {
    const provider = new FakeProvider(JSON.stringify({
        court: '北京市朝阳区人民法院',
        values: {
            plaintiff_natural: '原告张三，男，1990年1月5日出生。',
            defendant_natural: '被告李四，男，1988年1月10日出生。',
            claim_principal: '500000元',
            claim_interest: '按年利率10.8%计算',
            fact_amount: '2023年1月5日通过转账出借500000元。',
            fact_overdue: '被告到期后未按约还款。',
            fact_basis: '依据借款协议、银行转账记录、还款承诺书。',
        },
        warnings: [],
    }));

    const result = await generateElementComplaint(provider, COMPLAINT_SAMPLE);
    assert.ok(result.detectedCaseType.length > 0);
    assert.ok(result.renderModel.blocks.length > 0);
});
