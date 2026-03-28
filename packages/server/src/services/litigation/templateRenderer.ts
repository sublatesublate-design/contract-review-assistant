import PizZip from 'pizzip';
import { readTemplateAsset } from './templateAssets';
import type { TemplateManifest, TemplateManifestField } from './types';

interface RenderTemplateOptions {
    requestOrResponseText?: string;
    factText?: string;
}

interface ParagraphTemplate {
    paragraphProperties: string;
    runProperties: string;
}

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

export function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildXmlReplacement(value: string): string {
    return normalizeLineEndings(value)
        .split('\n')
        .map((segment) => escapeXml(segment))
        .join('</w:t><w:br/><w:t>');
}

function replacePlaceholderContent(xml: string, key: string, value: string): string {
    const token = `{{${key}}}`;
    if (!xml.includes(token)) {
        return xml;
    }
    return xml.split(token).join(buildXmlReplacement(value));
}

function splitParagraphXml(xml: string): string[] {
    return xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
}

function decodeXmlText(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&amp;/g, '&');
}

function hasVisibleText(paragraphXml: string): boolean {
    return /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(paragraphXml);
}

function extractParagraphTemplate(cellXml: string): ParagraphTemplate {
    const paragraphs = splitParagraphXml(cellXml).filter(hasVisibleText);
    const templateParagraph = paragraphs[paragraphs.length - 1] ?? '';
    return {
        paragraphProperties: templateParagraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '',
        runProperties: templateParagraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '',
    };
}

function buildInstructionParagraph(value: string, template: ParagraphTemplate): string {
    return [
        '<w:p>',
        template.paragraphProperties,
        `<w:r>${template.runProperties}<w:t>${buildXmlReplacement(value)}</w:t></w:r>`,
        '</w:p>',
    ].join('');
}

function hasExplicitSummaryField(manifest: TemplateManifest, section: 'request' | 'fact'): boolean {
    if (section === 'request') {
        return manifest.fields.some((field) => (
            /全文/u.test(field.label)
            && /(诉讼请求|请求事项|申请事项|申请请求|答辩意见|答辩请求|答辩事项|答辩理由|陈述意见|赔偿请求|执行请求|异议请求)/u.test(field.label)
        ));
    }

    return manifest.fields.some((field) => (
        /全文/u.test(field.label)
        && /(事实与理由|事实和理由|申请理由|异议理由|主要事实与理由|理由)/u.test(field.label)
    ));
}

function findSummaryAnchorKey(manifest: TemplateManifest, section: 'request' | 'fact'): string | null {
    if (section === 'request') {
        return manifest.fields.find((field) => /(诉讼请求|请求事项|申请事项|申请请求|答辩意见|答辩请求|答辩事项|答辩理由|陈述意见|赔偿请求|执行请求|异议请求)/u.test(field.blockTitle))?.key ?? null;
    }

    return manifest.fields.find((field) => /(事实与理由|事实和理由|申请理由|异议理由|主要事实与理由|理由)/u.test(field.blockTitle))?.key ?? null;
}

function appendInstructionContentBeforeAnchor(xml: string, anchorKey: string | null, value: string | undefined): string {
    const trimmed = normalizeLineEndings(value ?? '').trim();
    if (!trimmed || !anchorKey) {
        return xml;
    }

    const anchorIndex = xml.indexOf(`{{${anchorKey}}}`);
    if (anchorIndex < 0) {
        return xml;
    }

    const anchorRowStart = xml.lastIndexOf('<w:tr', anchorIndex);
    if (anchorRowStart < 0) {
        return xml;
    }

    const previousRowEnd = xml.lastIndexOf('</w:tr>', anchorRowStart);
    if (previousRowEnd < 0) {
        return xml;
    }

    const previousCellEnd = xml.lastIndexOf('</w:tc>', previousRowEnd);
    if (previousCellEnd < 0) {
        return xml;
    }

    const previousCellStart = xml.lastIndexOf('<w:tc', previousCellEnd);
    const previousCellXml = previousCellStart >= 0 ? xml.slice(previousCellStart, previousCellEnd) : '';
    const template = extractParagraphTemplate(previousCellXml);
    return `${xml.slice(0, previousCellEnd)}${buildInstructionParagraph(trimmed, template)}${xml.slice(previousCellEnd)}`;
}

export function findUnreplacedTokens(xml: string): string[] {
    return Array.from(new Set(xml.match(/{{[^{}]+}}/g) ?? []));
}

function clearUnreplacedTokens(xml: string): string {
    return xml.replace(/{{[^{}]+}}/g, '');
}

function getReplaceableXmlFiles(zip: PizZip): string[] {
    return zip
        .file(/word\/.+\.xml$/)
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith('word/_rels/'));
}

export function findUnreplacedTokensInDocx(buffer: Buffer): string[] {
    const zip = new PizZip(buffer);
    const tokens = new Set<string>();

    for (const fileName of getReplaceableXmlFiles(zip)) {
        const xml = zip.file(fileName)?.asText();
        if (!xml) {
            continue;
        }
        for (const token of findUnreplacedTokens(xml)) {
            tokens.add(token);
        }
    }

    return [...tokens];
}

export function clearUnreplacedTokensInDocx(buffer: Buffer): Buffer {
    const zip = new PizZip(buffer);

    for (const fileName of getReplaceableXmlFiles(zip)) {
        const xml = zip.file(fileName)?.asText();
        if (!xml) {
            continue;
        }

        const clearedXml = clearUnreplacedTokens(xml);
        if (clearedXml !== xml) {
            zip.file(fileName, clearedXml);
        }
    }

    return Buffer.from(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
}

function collapseToSingleSection(documentXml: string): string {
    const sectionMatches = documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g);
    if (!sectionMatches || sectionMatches.length <= 1) {
        return documentXml;
    }

    const primarySection = sectionMatches[0];
    const strippedXml = documentXml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/g, '');
    return strippedXml.replace('</w:body>', `${primarySection}</w:body>`);
}

function stripTrailingEmptyParagraphsBeforeSection(documentXml: string): string {
    const sectionIndex = documentXml.lastIndexOf('<w:sectPr');
    if (sectionIndex < 0) {
        return documentXml;
    }

    let prefix = documentXml.slice(0, sectionIndex);
    const suffix = documentXml.slice(sectionIndex);

    while (true) {
        const paragraphs = splitParagraphXml(prefix);
        const lastParagraph = paragraphs[paragraphs.length - 1];
        if (!lastParagraph || hasVisibleText(lastParagraph)) {
            break;
        }
        prefix = prefix.slice(0, prefix.lastIndexOf(lastParagraph));
    }

    return `${prefix}${suffix}`;
}

function collapseInterTableSpacing(documentXml: string): string {
    return documentXml.replace(/<\/w:tbl>((?:<w:p\b[\s\S]*?<\/w:p>)+)(?=<w:tbl)/g, (_match, paragraphGroup: string) => {
        const keptParagraphs = splitParagraphXml(paragraphGroup).filter(hasVisibleText);
        return `</w:tbl>${keptParagraphs.join('')}`;
    });
}

function extractCheckboxOptions(sourceText: string): string[] {
    const options: string[] = [];
    let segment = '';

    for (const char of sourceText) {
        if (char === '□' || char === '☑' || char === '☐') {
            const parts = segment
                .split(/[\s\u3000:：/／、，,；;。()\[\]（）]+/g)
                .map((part) => part.trim())
                .filter(Boolean);
            const option = parts[parts.length - 1] ?? '';
            if (option && !options.includes(option)) {
                options.push(option);
            }
            segment = '';
            continue;
        }
        segment += char;
    }

    return options;
}

function extractVisibleCellText(cellXml: string): string {
    return [...cellXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXmlText(match[1] ?? ''))
        .join('');
}

function normalizeComparisonText(text: string): string {
    return text.replace(/[☑☐□\s\u3000]/g, '');
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasStandaloneSingleCharOption(value: string, option: string): boolean {
    if (value.trim() === option || value.trim().startsWith(`${option} `) || value.trim().startsWith(`${option}：`) || value.trim().startsWith(`${option}:`)) {
        return true;
    }

    const escaped = escapeRegExp(option);
    const pattern = new RegExp(`(?:^|[\\s\\u3000,，。；;、:：/／()（）])${escaped}(?:$|[\\s\\u3000,，。；;、:：/／()（）])`);
    return pattern.test(value);
}

function findSelectedCheckboxOptions(value: string, options: string[]): string[] {
    const selected: string[] = [];
    let remaining = normalizeComparisonText(value);

    for (const option of [...options].sort((left, right) => normalizeComparisonText(right).length - normalizeComparisonText(left).length)) {
        const normalizedOption = normalizeComparisonText(option);
        if (!normalizedOption) {
            continue;
        }

        const isSingleCharChoice = normalizedOption.length === 1 && /^[是否有无男女]/u.test(normalizedOption);
        const matched = isSingleCharChoice
            ? hasStandaloneSingleCharOption(value, normalizedOption)
            : remaining.includes(normalizedOption);

        if (!matched) {
            continue;
        }

        selected.push(option);
        if (!isSingleCharChoice) {
            remaining = remaining.replace(normalizedOption, '');
        }
    }

    return selected;
}

function stripSelectedOptionsFromValue(value: string, selectedOptions: string[]): string {
    let stripped = value;
    for (const option of [...selectedOptions].sort((left, right) => right.length - left.length)) {
        stripped = stripped.replace(new RegExp(escapeRegExp(option), 'g'), '');
    }
    return stripped.replace(/[☑☐□\s\u3000,，。；;、:：/／()（）-]+/g, '');
}

function updateCheckboxesInCellXml(cellXml: string, selectedOptions: string[]): string {
    let updatedCellXml = cellXml;
    const optionList = extractCheckboxOptions(extractVisibleCellText(cellXml));

    for (const option of [...optionList].sort((left, right) => right.length - left.length)) {
        const marker = selectedOptions.includes(option) ? '☑' : '☐';
        updatedCellXml = updatedCellXml.replace(
            new RegExp(`${escapeRegExp(option)}[□☑☐]`, 'g'),
            `${option}${marker}`,
        );
    }

    return updatedCellXml;
}

function applyCheckboxSelections(
    documentXml: string,
    field: TemplateManifestField,
    value: string,
): { documentXml: string; value: string } {
    const token = `{{${field.key}}}`;
    const anchorIndex = documentXml.indexOf(token);
    if (anchorIndex < 0) {
        return { documentXml, value };
    }

    const cellStart = documentXml.lastIndexOf('<w:tc', anchorIndex);
    const cellEnd = documentXml.indexOf('</w:tc>', anchorIndex);
    if (cellStart < 0 || cellEnd < 0) {
        return { documentXml, value };
    }

    const cellXml = documentXml.slice(cellStart, cellEnd + '</w:tc>'.length);
    const optionSources = [field.hint ?? '', extractVisibleCellText(cellXml)];
    const checkboxOptions = optionSources
        .flatMap((sourceText) => extractCheckboxOptions(sourceText))
        .filter((option, index, allOptions) => option && allOptions.indexOf(option) === index);

    if (checkboxOptions.length === 0) {
        return { documentXml, value };
    }

    const selectedOptions = findSelectedCheckboxOptions(value, checkboxOptions);
    if (selectedOptions.length === 0) {
        return { documentXml, value };
    }

    const updatedCellXml = updateCheckboxesInCellXml(cellXml, selectedOptions);
    const remainingValue = stripSelectedOptionsFromValue(value, selectedOptions).length === 0 ? '' : value;

    return {
        documentXml: `${documentXml.slice(0, cellStart)}${updatedCellXml}${documentXml.slice(cellEnd + '</w:tc>'.length)}`,
        value: remainingValue,
    };
}

function insertTablePropertyAfter(
    tblPrInnerXml: string,
    snippet: string,
    anchorPatterns: RegExp[],
): string {
    for (const pattern of anchorPatterns) {
        const match = pattern.exec(tblPrInnerXml);
        if (!match || match.index == null) {
            continue;
        }
        const insertAt = match.index + match[0].length;
        return `${tblPrInnerXml.slice(0, insertAt)}${snippet}${tblPrInnerXml.slice(insertAt)}`;
    }
    return `${snippet}${tblPrInnerXml}`;
}

function normalizePrimaryTableProperties(documentXml: string): string {
    return documentXml.replace(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/, (_match, tblPrInnerXml: string) => {
        let normalized = tblPrInnerXml;

        if (/<w:jc\b[^>]*\/>/.test(normalized)) {
            normalized = normalized.replace(/<w:jc\b[^>]*\/>/g, '<w:jc w:val="center"/>');
        } else {
            normalized = insertTablePropertyAfter(
                normalized,
                '<w:jc w:val="center"/>',
                [/<w:tblW\b[^>]*\/>/, /<w:tblStyle\b[^>]*\/>/],
            );
        }

        if (/<w:tblInd\b[^>]*\/>/.test(normalized)) {
            normalized = normalized.replace(/<w:tblInd\b[^>]*\/>/g, '<w:tblInd w:w="0" w:type="dxa"/>');
        } else {
            normalized = insertTablePropertyAfter(
                normalized,
                '<w:tblInd w:w="0" w:type="dxa"/>',
                [/<w:jc\b[^>]*\/>/, /<w:tblW\b[^>]*\/>/, /<w:tblStyle\b[^>]*\/>/],
            );
        }

        return `<w:tblPr>${normalized}</w:tblPr>`;
    });
}

export function renderTemplateDocx(
    manifest: TemplateManifest,
    values: Record<string, string>,
    options: RenderTemplateOptions = {},
): Buffer {
    const zip = new PizZip(readTemplateAsset(manifest.templateFile));
    if (!zip.file('word/document.xml')) {
        throw new Error(`Template ${manifest.templateFile} is missing word/document.xml`);
    }

    for (const fileName of getReplaceableXmlFiles(zip)) {
        const xml = zip.file(fileName)?.asText();
        if (!xml) {
            continue;
        }

        let renderedXml = xml;
        const fieldValues = { ...values };

        if (fileName === 'word/document.xml') {
            if (!hasExplicitSummaryField(manifest, 'request')) {
                renderedXml = appendInstructionContentBeforeAnchor(
                    renderedXml,
                    findSummaryAnchorKey(manifest, 'request'),
                    options.requestOrResponseText,
                );
            }
            if (!hasExplicitSummaryField(manifest, 'fact')) {
                renderedXml = appendInstructionContentBeforeAnchor(
                    renderedXml,
                    findSummaryAnchorKey(manifest, 'fact'),
                    options.factText,
                );
            }

            for (const field of manifest.fields) {
                const applied = applyCheckboxSelections(renderedXml, field, fieldValues[field.key] ?? '');
                renderedXml = applied.documentXml;
                fieldValues[field.key] = applied.value;
            }
        }

        for (const field of manifest.fields) {
            renderedXml = replacePlaceholderContent(renderedXml, field.key, fieldValues[field.key] ?? '');
        }

        if (renderedXml !== xml) {
            if (fileName === 'word/document.xml') {
                renderedXml = collapseToSingleSection(renderedXml);
                renderedXml = collapseInterTableSpacing(renderedXml);
                renderedXml = stripTrailingEmptyParagraphsBeforeSection(renderedXml);
                renderedXml = normalizePrimaryTableProperties(renderedXml);
            }
            zip.file(fileName, renderedXml);
        }
    }

    return Buffer.from(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
}
