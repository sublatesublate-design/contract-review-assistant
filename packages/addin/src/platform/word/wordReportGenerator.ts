/* global Word */

import type { IReportGenerator } from '../types';
import type { ReviewResult } from '../../types/review';
import type { ContractSummary } from '../../types/summary';

export function createWordReportGenerator(): IReportGenerator {
    return {
        async generateReport(
            result: ReviewResult,
            summary: ContractSummary | null,
            contractTypeLabel?: string
        ): Promise<void> {
            await Word.run(async (context) => {
                const newDoc = context.application.createDocument();
                const newDocBody = newDoc.body;

                // --- 封面 ---
                const titleParagraph = newDocBody.insertParagraph('合同审查报告', Word.InsertLocation.end);
                titleParagraph.styleBuiltIn = Word.BuiltInStyleName.title;
                titleParagraph.font.color = '#1F2937';
                titleParagraph.font.bold = true;
                titleParagraph.alignment = Word.Alignment.centered;

                newDocBody.insertParagraph('', Word.InsertLocation.end);

                const timeParagraph = newDocBody.insertParagraph(
                    `审查时间：${new Date(result.createdAt).toLocaleString()}`,
                    Word.InsertLocation.end
                );
                timeParagraph.alignment = Word.Alignment.centered;
                timeParagraph.font.color = '#6B7280';

                const modelParagraph = newDocBody.insertParagraph(`AI 模型：${result.model}`, Word.InsertLocation.end);
                modelParagraph.alignment = Word.Alignment.centered;
                modelParagraph.font.color = '#6B7280';

                if (contractTypeLabel) {
                    const typeParagraph = newDocBody.insertParagraph(
                        `自动识别类型：${contractTypeLabel}`,
                        Word.InsertLocation.end
                    );
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
                    const infoHeader = newDocBody.insertParagraph('二、 合同关键信息', Word.InsertLocation.end);
                    infoHeader.styleBuiltIn = Word.BuiltInStyleName.heading1;
                    infoHeader.font.color = '#111827';

                    const table = newDocBody.insertTable(6, 2, Word.InsertLocation.end, [
                        ['信息项', '提取内容'],
                        ['合同金额', summary.amount || '未见明确约定'],
                        ['合同期限', summary.duration || '未见明确约定'],
                        ['当事人', summary.parties?.map(p => `${p.role}: ${p.name}`).join('; ') || '未见明确约定'],
                        ['关键日期', summary.keyDates?.join('; ') || '无'],
                        ['争议解决', summary.disputeResolution || '未见明确约定'],
                    ]);
                    table.styleBuiltIn = Word.BuiltInStyleName.gridTable4;
                    table.headerRowCount = 1;
                    table.autoFitWindow();
                    newDocBody.insertParagraph('', Word.InsertLocation.end);
                }

                // --- 风险问题清单 ---
                const issueHeader = newDocBody.insertParagraph(
                    summary ? '三、 具体风险及修改建议' : '二、 具体风险及修改建议',
                    Word.InsertLocation.end
                );
                issueHeader.styleBuiltIn = Word.BuiltInStyleName.heading1;
                issueHeader.font.color = '#111827';

                const activeIssues = result.issues.filter(i => i.status !== 'dismissed');
                const riskWeight = { high: 3, medium: 2, low: 1, info: 0 };
                activeIssues.sort((a, b) => riskWeight[b.riskLevel] - riskWeight[a.riskLevel]);

                if (activeIssues.length === 0) {
                    newDocBody.insertParagraph('未发现需要处理的重大风险问题。', Word.InsertLocation.end);
                } else {
                    activeIssues.forEach((issue, index) => {
                        const riskLabel = issue.riskLevel === 'high' ? '高风险' : issue.riskLevel === 'medium' ? '中风险' : '低风险';
                        const riskColor = issue.riskLevel === 'high' ? '#DC2626' : issue.riskLevel === 'medium' ? '#D97706' : '#059669';

                        const itemHeader = newDocBody.insertParagraph(
                            `${index + 1}. [${riskLabel}] ${issue.title}`,
                            Word.InsertLocation.end
                        );
                        itemHeader.styleBuiltIn = Word.BuiltInStyleName.heading2;
                        itemHeader.font.color = riskColor;

                        if (issue.originalText) {
                            const pOrig = newDocBody.insertParagraph(`原文: "${issue.originalText}"`, Word.InsertLocation.end);
                            pOrig.font.italic = true;
                            pOrig.font.color = '#6B7280';
                        }

                        newDocBody.insertParagraph(`分析: ${issue.description}`, Word.InsertLocation.end);

                        if (issue.suggestedText) {
                            const pSug = newDocBody.insertParagraph(`建议修改为: ${issue.suggestedText}`, Word.InsertLocation.end);
                            pSug.font.bold = true;
                        }

                        newDocBody.insertParagraph('', Word.InsertLocation.end);
                    });
                }

                await context.sync();
                newDoc.open();
                await context.sync();
            });
        },
    };
}
