/**
 * litigationDetector.ts
 * 基于关键词规则快速识别诉讼文书子类型（无需额外 AI 调用）
 * 支持：起诉状、答辩状、上诉状、代理词、申请书、通用
 */

export type LitigationSubtype =
    | 'complaint'          // 起诉状
    | 'defense'            // 答辩状
    | 'appeal'             // 上诉状
    | 'closing_argument'   // 代理词
    | 'application'        // 申请书/异议书
    | 'general';           // 通用（未识别）

export interface LitigationDetectResult {
    subtype: LitigationSubtype;
    label: string;
    confidence: 'high' | 'medium' | 'low';
}

const LITIGATION_RULES: Array<{
    subtype: LitigationSubtype;
    label: string;
    /** 命中任意一组（OR 逻辑），组内关键词需全部命中（AND 逻辑） */
    patterns: string[][];
}> = [
        {
            subtype: 'complaint',
            label: '起诉状',
            patterns: [
                ['起诉状'],
                ['民事起诉'],
                ['诉讼请求', '事实与理由', '原告'],
                ['原告', '被告', '诉讼请求'],
            ],
        },
        {
            subtype: 'defense',
            label: '答辩状',
            patterns: [
                ['答辩状'],
                ['民事答辩'],
                ['答辩人', '被答辩人'],
                ['答辩意见', '答辩人'],
                ['答辩称'],
            ],
        },
        {
            subtype: 'appeal',
            label: '上诉状',
            patterns: [
                ['上诉状'],
                ['民事上诉'],
                ['上诉人', '被上诉人'],
                ['上诉请求', '上诉理由'],
                ['不服', '判决', '提起上诉'],
            ],
        },
        {
            subtype: 'closing_argument',
            label: '代理词',
            patterns: [
                ['代理词'],
                ['代理意见'],
                ['审判长', '审判员', '代理人'],
                ['争议焦点', '代理人认为'],
                ['庭审', '质证意见'],
            ],
        },
        {
            subtype: 'application',
            label: '申请书',
            patterns: [
                ['申请书'],
                ['申请人', '申请事项'],
                ['异议书'],
                ['管辖权异议'],
                ['财产保全', '申请'],
                ['强制执行', '申请'],
                ['再审申请'],
            ],
        },
    ];

/**
 * 检测诉讼文书子类型
 * @param text 文书全文（前 3000 字符即可）
 */
export function detectLitigationSubtype(text: string): LitigationDetectResult {
    const sample = text.slice(0, 3000);

    let bestMatch: { subtype: LitigationSubtype; label: string; score: number } | null = null;

    for (const rule of LITIGATION_RULES) {
        let ruleScore = 0;
        for (const patternGroup of rule.patterns) {
            const allMatch = patternGroup.every((kw) => sample.includes(kw));
            if (allMatch) ruleScore++;
        }
        if (ruleScore > 0) {
            if (!bestMatch || ruleScore > bestMatch.score) {
                bestMatch = { subtype: rule.subtype, label: rule.label, score: ruleScore };
            }
        }
    }

    if (!bestMatch) {
        return { subtype: 'general', label: '诉讼文书', confidence: 'low' };
    }
    return {
        subtype: bestMatch.subtype,
        label: bestMatch.label,
        confidence: bestMatch.score >= 2 ? 'high' : 'medium',
    };
}
