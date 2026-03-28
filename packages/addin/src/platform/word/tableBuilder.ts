/* global Word */

import type {
    ElementComplaintTableBlock,
    ElementComplaintTableRow,
} from '../../types/elementComplaint';

type CellAlignment = 'left' | 'center' | 'right' | 'justify';

function toWordAlignment(alignment: CellAlignment): Word.Alignment {
    switch (alignment) {
        case 'center':
            return Word.Alignment.centered;
        case 'right':
            return Word.Alignment.right;
        case 'justify':
            return Word.Alignment.justified;
        case 'left':
        default:
            return Word.Alignment.left;
    }
}

function rowToCellValues(row: ElementComplaintTableRow): string[] {
    if (row.type === 'pair') {
        return [row.label, row.value];
    }
    return [row.text, ''];
}

export class TableBuilder {
    constructor(private readonly body: Word.Body) {}

    public appendParagraph(
        text: string,
        options?: { align?: CellAlignment; bold?: boolean; color?: string }
    ): Word.Paragraph {
        const paragraph = this.body.insertParagraph(text || ' ', Word.InsertLocation.end);
        paragraph.font.name = 'SimSun';
        paragraph.font.size = 11;
        paragraph.font.bold = options?.bold ?? false;
        paragraph.font.color = options?.color ?? '#111827';
        paragraph.alignment = toWordAlignment(options?.align ?? 'left');
        return paragraph;
    }

    public appendBlankLine(): Word.Paragraph {
        return this.appendParagraph(' ');
    }

    public appendTable(block: ElementComplaintTableBlock): Word.Table {
        const rows: string[][] = [];
        if (block.title) {
            rows.push([block.title, '']);
        }
        for (const row of block.rows) {
            rows.push(rowToCellValues(row));
        }

        const table = this.body.insertTable(rows.length, 2, Word.InsertLocation.end, rows);
        table.styleBuiltIn = Word.BuiltInStyleName.gridTable4;

        let rowIndex = 0;
        if (block.title) {
            table.mergeCells(rowIndex, 0, rowIndex, 1);
            this.writeMergedCell(table.getCell(rowIndex, 0), block.title, {
                bold: true,
                align: 'center',
            });
            rowIndex += 1;
        }

        for (const row of block.rows) {
            if (row.type === 'pair') {
                this.writeCell(table.getCell(rowIndex, 0), row.label, {
                    bold: row.labelBold ?? true,
                    align: 'left',
                });
                this.writeCell(table.getCell(rowIndex, 1), row.value, {
                    bold: row.valueBold ?? false,
                    align: 'left',
                });
            } else {
                table.mergeCells(rowIndex, 0, rowIndex, 1);
                this.writeMergedCell(table.getCell(rowIndex, 0), row.text, {
                    bold: row.bold ?? false,
                    align: row.align ?? 'left',
                });
            }
            rowIndex += 1;
        }

        return table;
    }

    private writeCell(
        cell: Word.TableCell,
        text: string,
        options?: { bold?: boolean; align?: CellAlignment }
    ): void {
        cell.body.clear();
        const paragraph = cell.body.insertParagraph(text || ' ', Word.InsertLocation.end);
        paragraph.font.name = 'SimSun';
        paragraph.font.size = 11;
        paragraph.font.bold = options?.bold ?? false;
        paragraph.alignment = toWordAlignment(options?.align ?? 'left');
        cell.verticalAlignment = Word.VerticalAlignment.center;
    }

    private writeMergedCell(
        cell: Word.TableCell,
        text: string,
        options?: { bold?: boolean; align?: CellAlignment }
    ): void {
        this.writeCell(cell, text, options);
    }
}
