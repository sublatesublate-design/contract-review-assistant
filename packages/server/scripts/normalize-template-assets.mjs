import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateRoot = path.resolve(__dirname, '..', 'assets', 'templates');

const BAD_SECTION_PATTERN = /<w:pgSz\b[^>]*w:w="11650"[^>]*w:h="16820"[\s\S]*?<w:pgMar\b[^>]*w:top="1"[^>]*w:right="0"[^>]*w:bottom="1"[^>]*w:left="0"/;

function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, '\n');
}

function extractBody(documentXml) {
    const match = documentXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
    if (!match) {
        throw new Error('word/document.xml is missing <w:body>');
    }
    return match[1];
}

function replaceBody(documentXml, bodyInnerXml) {
    return documentXml.replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${bodyInnerXml}</w:body>`);
}

function readTopLevelElement(bodyXml, start) {
    if (bodyXml.startsWith('<w:p', start)) {
        const end = bodyXml.indexOf('</w:p>', start);
        if (end < 0) throw new Error('Unclosed paragraph in document body');
        return { type: 'p', xml: bodyXml.slice(start, end + '</w:p>'.length), end: end + '</w:p>'.length };
    }

    if (bodyXml.startsWith('<w:tbl', start)) {
        const end = bodyXml.indexOf('</w:tbl>', start);
        if (end < 0) throw new Error('Unclosed table in document body');
        return { type: 'tbl', xml: bodyXml.slice(start, end + '</w:tbl>'.length), end: end + '</w:tbl>'.length };
    }

    if (bodyXml.startsWith('<w:sectPr', start)) {
        const end = bodyXml.indexOf('</w:sectPr>', start);
        if (end < 0) throw new Error('Unclosed sectPr in document body');
        return { type: 'sectPr', xml: bodyXml.slice(start, end + '</w:sectPr>'.length), end: end + '</w:sectPr>'.length };
    }

    return null;
}

function splitBodyElements(bodyXml) {
    const elements = [];
    let cursor = 0;

    while (cursor < bodyXml.length) {
        const pIndex = bodyXml.indexOf('<w:p', cursor);
        const tblIndex = bodyXml.indexOf('<w:tbl', cursor);
        const sectIndex = bodyXml.indexOf('<w:sectPr', cursor);
        const nextIndex = [pIndex, tblIndex, sectIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];

        if (nextIndex == null) {
            break;
        }

        cursor = nextIndex;
        const element = readTopLevelElement(bodyXml, cursor);
        if (!element) {
            cursor += 1;
            continue;
        }

        elements.push({ type: element.type, xml: element.xml });
        cursor = element.end;
    }

    return elements;
}

function extractTextRuns(xml) {
    return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1] ?? '');
}

function decodeXml(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&amp;/g, '&');
}

function stripParagraphSectPr(paragraphXml) {
    return paragraphXml.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '');
}

function hasVisibleText(paragraphXml) {
    const text = extractTextRuns(paragraphXml).map(decodeXml).join('').replace(/\s+/g, '').trim();
    return text.length > 0;
}

function collectSectPrCandidates(bodyXml, elements) {
    const candidates = [];
    for (const match of bodyXml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)) {
        candidates.push(match[0]);
    }
    for (const element of elements) {
        if (element.type !== 'p') continue;
        for (const match of element.xml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)) {
            candidates.push(match[0]);
        }
    }
    return candidates;
}

function chooseSectPr(candidates) {
    if (candidates.length === 0) {
        return '';
    }
    return candidates.find((candidate) => !BAD_SECTION_PATTERN.test(candidate)) ?? candidates[0];
}

function extractTableParts(tableXml) {
    const tblPr = tableXml.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/)?.[0] ?? '';
    const tblGrid = tableXml.match(/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/)?.[0] ?? '';
    const rows = tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
    return { tblPr, tblGrid, rows };
}

function insertTablePropertyAfter(tblPrInnerXml, snippet, anchorPatterns) {
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

function normalizeTableAlignment(tableXml) {
    return tableXml.replace(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/, (_match, tblPrInnerXml) => {
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

function gridColumnCount(tblGridXml) {
    return (tblGridXml.match(/<w:gridCol\b/g) ?? []).length;
}

function mergeTableGroup(tableXmlList) {
    if (tableXmlList.length === 1) {
        return normalizeTableAlignment(tableXmlList[0]);
    }

    const tables = tableXmlList.map(extractTableParts);
    const baseProps = tables[0]?.tblPr ?? '';
    const bestGrid = tables
        .map((table) => table.tblGrid)
        .sort((a, b) => gridColumnCount(b) - gridColumnCount(a))[0] ?? '';
    const rows = tables.flatMap((table) => table.rows);

    return normalizeTableAlignment(`<w:tbl>${baseProps}${bestGrid}${rows.join('')}</w:tbl>`);
}

function normalizeFooterLabels(xml, fileName) {
    const signerLabel = fileName.startsWith('defense_')
        ? '答辩人（签字、盖章）：'
        : '具状人（签字、盖章）：';

    return xml
        .replace(/(?:鍏风姸浜猴紙绛惧瓧銆佺洊绔狅級|具状人（签字、盖章）)\?*(\{\{field_\d+\}\})/g, `${signerLabel}$1`)
        .replace(/(?:绛旇京浜猴紙绛惧瓧銆佺洊绔狅級|答辩人（签字、盖章）)\?*(\{\{field_\d+\}\})/g, `${signerLabel}$1`)
        .replace(/(?:\?{2,}|？{2,}|日期[:：]?\?*)(\{\{field_\d+\}\})/g, '日期：$1');
}

function groupTablesForMerge(elements, fileName) {
    const tableIndexes = elements
        .map((element, index) => ({ element, index }))
        .filter(({ element }) => element.type === 'tbl')
        .map(({ index }) => index);

    if (tableIndexes.length <= 1) {
        return new Map();
    }

    const mergeGroups = new Map();

    const explicitGroups = {
        complaint_divorce: [[0, 1, 2, 3]],
        complaint_private_loan: [[0, 1], [2], [3, 4, 5]],
        complaint_sale: [[0, 1, 2, 3, 4, 5]],
        complaint_traffic: [[0, 1, 2, 3, 4]],
        defense_divorce: [[0], [1, 2]],
        defense_private_loan: [[0], [1, 2, 3]],
        defense_sale: [[0], [1, 2, 3, 4]],
        defense_traffic: [[0], [1, 2]],
    }[path.basename(fileName, '.docx')];

    if (!explicitGroups) {
        return mergeGroups;
    }

    for (const group of explicitGroups) {
        const mappedIndexes = group.map((position) => tableIndexes[position]).filter((index) => index != null);
        if (mappedIndexes.length === 0) continue;
        mergeGroups.set(mappedIndexes[0], mappedIndexes);
    }

    return mergeGroups;
}

function normalizeDocumentXml(documentXml, fileName) {
    const bodyXml = extractBody(documentXml);
    const elements = splitBodyElements(bodyXml).map((element) => (
        element.type === 'p'
            ? { ...element, xml: stripParagraphSectPr(element.xml) }
            : element
    ));
    const sectPr = chooseSectPr(collectSectPrCandidates(bodyXml, elements));
    const mergeGroups = groupTablesForMerge(elements, fileName);

    const normalizedElements = [];
    let index = 0;

    while (index < elements.length) {
        const element = elements[index];

        if (element.type === 'tbl') {
            const groupIndexes = mergeGroups.get(index);
            if (groupIndexes?.length) {
                normalizedElements.push(mergeTableGroup(groupIndexes.map((groupIndex) => elements[groupIndex].xml)));
                index = groupIndexes[groupIndexes.length - 1] + 1;
                continue;
            }

            normalizedElements.push(normalizeTableAlignment(element.xml));
            index += 1;
            continue;
        }

        if (element.type === 'p') {
            const previous = normalizedElements[normalizedElements.length - 1] ?? '';
            const nextTableIndex = elements.slice(index + 1).findIndex((item) => item.type === 'tbl');
            const nextType = nextTableIndex >= 0 ? 'tbl' : null;
            const betweenTables = previous.startsWith('<w:tbl') && nextType === 'tbl';
            if (betweenTables && !hasVisibleText(element.xml)) {
                index += 1;
                continue;
            }

            if (!hasVisibleText(element.xml) && index >= elements.length - 3) {
                index += 1;
                continue;
            }

            normalizedElements.push(element.xml);
            index += 1;
            continue;
        }

        index += 1;
    }

    const normalizedBody = normalizeFooterLabels(
        normalizeLineEndings(
            normalizedElements.join('') + sectPr,
        ),
        fileName,
    );

    return replaceBody(documentXml, normalizedBody);
}

function normalizeTemplateAsset(templatePath) {
    const originalBuffer = fs.readFileSync(templatePath);
    const zip = new PizZip(originalBuffer);
    const documentEntry = zip.file('word/document.xml');
    if (!documentEntry) {
        throw new Error(`Template ${templatePath} is missing word/document.xml`);
    }

    const normalizedDocumentXml = normalizeDocumentXml(documentEntry.asText(), path.basename(templatePath));
    zip.file('word/document.xml', normalizedDocumentXml);
    const outputBuffer = Buffer.from(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
    const tempPath = `${templatePath}.tmp`;
    fs.writeFileSync(tempPath, outputBuffer);
    fs.copyFileSync(tempPath, templatePath);
    fs.rmSync(tempPath, { force: true });
}

function main() {
    const templateFiles = fs
        .readdirSync(templateRoot)
        .filter((file) => file.endsWith('.docx') && !file.startsWith('~$'))
        .filter((file) => !file.endsWith('_cleaned.docx'))
        .sort();

    const failures = [];

    for (const templateFile of templateFiles) {
        const templatePath = path.join(templateRoot, templateFile);
        let normalized = false;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                normalizeTemplateAsset(templatePath);
                console.log(`normalized ${templateFile}`);
                normalized = true;
                break;
            } catch (error) {
                if (attempt === 3) {
                    failures.push({ templateFile, error: error instanceof Error ? error.message : String(error) });
                }
            }
        }
    }

    if (failures.length > 0) {
        for (const failure of failures) {
            console.error(`failed ${failure.templateFile}: ${failure.error}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('Template assets normalized.');
}

main();
