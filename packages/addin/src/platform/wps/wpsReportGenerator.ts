import type { IReportGenerator } from '../types';
import type { ReviewResult } from '../../types/review';
import type { ContractSummary } from '../../types/summary';
/// <reference path="./wps-jsapi.d.ts" />

export class WpsReportGenerator implements IReportGenerator {
    public async generateReport(result: ReviewResult, summary: ContractSummary | null, documentLabel?: string): Promise<void> {
        if (!window.wps) return;
        const app = window.wps.WpsApplication();

        // 创建新文档
        const doc = app.Documents.Add();
        const range = doc.Content;

        // 简单报表逻辑实现，通过纯文本和基础 Table 实现
        range.Text = '法律写作审校报告\n\n';
        range.Collapse(window.wps.Enum?.wdCollapseEnd || 0);

        if (documentLabel) {
            range.InsertAfter(`审校模式：${documentLabel}\n`);
            range.Collapse(window.wps.Enum?.wdCollapseEnd || 0);
        }

        if (summary) {
            const summaryText = [
                `\n【结构化摘要】`,
                summary.overview ? `摘要概览：${summary.overview}` : '',
                ...(summary.fields || []).map(field => `${field.label}：${field.value || '未见明确约定'}`),
                ...(summary.sections || []).map(section => `${section.title}：${section.items.length > 0 ? section.items.join('；') : '未见明确约定'}`),
            ].join('\n') + '\n';
            range.InsertAfter(summaryText);
            range.Collapse(window.wps.Enum?.wdCollapseEnd || 0);
        }

        range.InsertAfter(`\n【风险问题清单】 (共发现 ${result.issues.length} 项)\n`);
        range.Collapse(window.wps.Enum?.wdCollapseEnd || 0);

        const tables = doc.Tables;
        if (result.issues.length > 0) {
            // 参数：起始 Range, 行数，列数
            const table = tables.Add(range, result.issues.length + 1, 4);
            // 写标题行
            table.Cell(1, 1).Range.Text = '序号';
            table.Cell(1, 2).Range.Text = '风险等级';
            table.Cell(1, 3).Range.Text = '问题说明';
            table.Cell(1, 4).Range.Text = '修改建议';

            // 填充内容
            result.issues.forEach((issue, idx) => {
                const r = idx + 2;
                table.Cell(r, 1).Range.Text = String(idx + 1);
                table.Cell(r, 2).Range.Text = issue.riskLevel;
                table.Cell(r, 3).Range.Text = issue.description;
                table.Cell(r, 4).Range.Text = issue.suggestedText || '无';
            });
        }
    }
}
