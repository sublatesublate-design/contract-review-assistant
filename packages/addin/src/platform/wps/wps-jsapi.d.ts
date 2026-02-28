// wps-jsapi.d.ts
// WPS Office JSAPI 类型声明 (精简版，针对本项目需要)

declare namespace _wps {
    export interface Range {
        Text: string;
        Select(): void;
        HighlightColorIndex: number;
        Find: Find;
        Start: number;
        End: number;
        End_2: number;
        InsertAfter(text: string): void;
        Collapse(direction: number): void;
    }

    export interface Find {
        Execute(
            findText?: string,
            matchCase?: boolean,
            matchWholeWord?: boolean,
            matchWildcards?: boolean,
            matchSoundsLike?: boolean,
            matchAllWordForms?: boolean,
            forward?: boolean,
            wrap?: number,
            format?: boolean,
            replaceWith?: string,
            replace?: number
        ): boolean;
    }

    export interface Paragraph {
        Range: Range;
    }

    export interface Paragraphs {
        Count: number;
        Item(index: number): Paragraph;
    }

    export interface Cell {
        Range: Range;
    }

    export interface Row {
        Cells: Cells;
    }

    export interface Cells {
        Item(index: number): Cell;
    }

    export interface Rows {
        Count: number;
        Item(index: number): Row;
    }

    export interface Columns {
        Count: number;
    }

    export interface Table {
        Rows: Rows;
        Columns: Columns;
        Cell(row: number, column: number): Cell;
    }

    export interface Tables {
        Count: number;
        Item(index: number): Table;
        Add(range: Range, numRows: number, numColumns: number): Table;
    }

    export interface Comment {
        Range: Range;
    }

    export interface Comments {
        Add(range: Range, text: string): void;
    }

    export interface Document {
        Content: Range;
        Paragraphs: Paragraphs;
        Tables: Tables;
        Comments: Comments;
        TrackRevisions: boolean;
        Name: string;
    }

    export interface Documents {
        Add(): Document;
    }

    export interface Selection {
        Text: string;
        Range: Range;
        Collapse(direction: number): void;
        InsertParagraphAfter(): void;
    }

    export interface CustomTaskPanes {
        Item(index: number): any;
        Add(url: string, title?: string): any;
    }

    export interface Application {
        ActiveDocument: Document;
        Documents: Documents;
        Selection: Selection;
        CustomTaskPanes: CustomTaskPanes;
    }
}

interface Window {
    wps?: {
        WpsApplication(): _wps.Application;
        Enum?: {
            wdCollapseEnd: number;
            wdColorIndexYellow: number;
            wdColorIndexNone: number;
            wdFindStop: number;
        };
    };
}
