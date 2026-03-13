import type { ReviewResult } from '../types/review';
import type { ContractSummary } from '../types/summary';

export async function generateReviewReport(
    context: Word.RequestContext,
    result: ReviewResult,
    summary: ContractSummary | null,
    documentLabel?: string
) {
    // 1. 获取当前文档作为原始合同材料
    const originalBody = context.document.body;
    originalBody.load('text');
    await context.sync();

    // 2. 创建一个新文档用于生成报告
    const newDoc = context.application.createDocument();

    // 我们必须获取新文档的引用才能操作它
    const newDocBody = newDoc.body;

    // --- 封面 ---
    const titleParagraph = newDocBody.insertParagraph('法律写作审校报告', Word.InsertLocation.end);
    titleParagraph.styleBuiltIn = Word.BuiltInStyleName.title;
    titleParagraph.font.color = '#1F2937';
    titleParagraph.font.bold = true;
    titleParagraph.alignment = Word.Alignment.centered;

    newDocBody.insertParagraph('', Word.InsertLocation.end);

    const timeParagraph = newDocBody.insertParagraph(`审查时间：${new Date(result.createdAt).toLocaleString()}`, Word.InsertLocation.end);
    timeParagraph.alignment = Word.Alignment.centered;
    timeParagraph.font.color = '#6B7280';

    const modelParagraph = newDocBody.insertParagraph(`AI 模型：${result.model}`, Word.InsertLocation.end);
    modelParagraph.alignment = Word.Alignment.centered;
    modelParagraph.font.color = '#6B7280';

    if (documentLabel) {
        const typeParagraph = newDocBody.insertParagraph(`审校模式：${documentLabel}`, Word.InsertLocation.end);
        typeParagraph.alignment = Word.Alignment.centered;
        typeParagraph.font.color = '#6B7280';
    }

    newDocBody.insertBreak(Word.BreakType.page, Word.InsertLocation.end);

    // --- 总体摘要 ---
    const summaryHeader = newDocBody.insertParagraph('一、 总体审查结论', Word.InsertLocation.end);
    summaryHeader.styleBuiltIn = Word.BuiltInStyleName.heading1;
    summaryHeader.font.color = '#111827';

    const summaryContent = newDocBody.insertParagraph(result.summary, Word.InsertLocation.end);
    summaryContent.font.color = '#374151';

    newDocBody.insertParagraph('', Word.InsertLocation.end);

    if (summary) {
        const infoHeader = newDocBody.insertParagraph('二、 结构化摘要', Word.InsertLocation.end);
        infoHeader.styleBuiltIn = Word.BuiltInStyleName.heading1;
        infoHeader.font.color = '#111827';

        if (summary.overview) {
            newDocBody.insertParagraph(summary.overview, Word.InsertLocation.end);
            newDocBody.insertParagraph('', Word.InsertLocation.end);
        }

        if (summary.fields?.length > 0) {
            const tableRows = [
                ['信息项', '提取内容'],
                ...summary.fields.map((field) => [field.label, field.value || '未见明确约定'])
            ];
            const table = newDocBody.insertTable(tableRows.length, 2, Word.InsertLocation.end, tableRows);
            table.styleBuiltIn = Word.BuiltInStyleName.gridTable4;
            table.headerRowCount = 1;
            table.autoFitWindow();
            newDocBody.insertParagraph('', Word.InsertLocation.end);
        }

        summary.sections?.forEach((section) => {
            const sectionHeader = newDocBody.insertParagraph(section.title, Word.InsertLocation.end);
            sectionHeader.styleBuiltIn = Word.BuiltInStyleName.heading2;
            sectionHeader.font.color = '#1F2937';

            if (section.items.length === 0) {
                newDocBody.insertParagraph('未见明确约定', Word.InsertLocation.end);
            } else {
                section.items.forEach((item) => {
                    newDocBody.insertParagraph(`• ${item}`, Word.InsertLocation.end);
                });
            }

            newDocBody.insertParagraph('', Word.InsertLocation.end);
        });

        newDocBody.insertParagraph('', Word.InsertLocation.end);
    }

    // --- 风险问题清单 ---
    const issueHeader = newDocBody.insertParagraph(summary ? '三、 具体风险及修改建议' : '二、 具体风险及修改建议', Word.InsertLocation.end);
    issueHeader.styleBuiltIn = Word.BuiltInStyleName.heading1;
    issueHeader.font.color = '#111827';

    // 过滤掉已忽略的问题，并按风险等级排序：高 -> 中 -> 低
    const activeIssues = result.issues.filter(i => i.status !== 'dismissed');

    // Sort logic mapping
    const riskWeight = { high: 3, medium: 2, low: 1, info: 0 };

    activeIssues.sort((a, b) => {
        return riskWeight[b.riskLevel] - riskWeight[a.riskLevel];
    });

    if (activeIssues.length === 0) {
        newDocBody.insertParagraph('未发现需要处理的重大风险问题。', Word.InsertLocation.end);
    } else {
        activeIssues.forEach((issue, index) => {
            const riskLabel = issue.riskLevel === 'high' ? '高风险' : issue.riskLevel === 'medium' ? '中风险' : '低风险';
            const riskColor = issue.riskLevel === 'high' ? '#DC2626' : issue.riskLevel === 'medium' ? '#D97706' : '#059669';

            // 标题
            const itemHeader = newDocBody.insertParagraph(`${index + 1}. [${riskLabel}] ${issue.title}`, Word.InsertLocation.end);
            itemHeader.styleBuiltIn = Word.BuiltInStyleName.heading2;
            itemHeader.font.color = riskColor;

            // 原文
            if (issue.originalText) {
                const pOrig = newDocBody.insertParagraph(`原文: "${issue.originalText}"`, Word.InsertLocation.end);
                pOrig.font.italic = true;
                pOrig.font.color = '#6B7280';
            }

            // 分析
            newDocBody.insertParagraph(`分析: ${issue.description}`, Word.InsertLocation.end);

            // 建议
            if (issue.suggestedText) {
                const pSug = newDocBody.insertParagraph(`建议修改为: ${issue.suggestedText}`, Word.InsertLocation.end);
                pSug.font.bold = true;
            }

            newDocBody.insertParagraph('', Word.InsertLocation.end);
        });
    }

    await context.sync();
    // 打开新生成的报告文档
    newDoc.open();
    await context.sync();
}
