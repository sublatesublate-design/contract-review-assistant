/**
 * contractDetector.ts
 * 基于关键词规则快速识别合同类型（无需额外 AI 调用）
 * 支持：买卖、劳动、租赁、服务、借款、保密（NDA）、承揽、通用
 */

export type ContractType =
    | 'sale'            // 买卖合同
    | 'labor'           // 劳动合同
    | 'lease'           // 租赁合同
    | 'service'         // 服务/委托合同
    | 'loan'            // 借款/借贷合同
    | 'nda'             // 保密协议
    | 'construction'    // 承揽/建设工程合同
    | 'general';        // 通用（未识别）

export interface ContractDetectResult {
    type: ContractType;
    label: string;
    confidence: 'high' | 'medium' | 'low';
}

const CONTRACT_RULES: Array<{
    type: ContractType;
    label: string;
    /** 命中任意一组（ OR 逻辑），组内关键词需全部命中（ AND 逻辑） */
    patterns: string[][];
}> = [
        {
            type: 'labor',
            label: '劳动合同',
            patterns: [
                ['劳动合同'],
                ['用人单位', '劳动者'],
                ['试用期', '工资', '社会保险'],
                ['劳动报酬', '工作内容'],
            ],
        },
        {
            type: 'lease',
            label: '租赁合同',
            patterns: [
                ['租赁合同'],
                ['出租人', '承租人'],
                ['租金', '租期'],
                ['房租', '押金', '租赁物'],
            ],
        },
        {
            type: 'loan',
            label: '借款合同',
            patterns: [
                ['借款合同'],
                ['借款人', '贷款人'],
                ['借款金额', '还款'],
                ['利息', '贷款', '还款期限'],
            ],
        },
        {
            type: 'nda',
            label: '保密协议',
            patterns: [
                ['保密协议'],
                ['non-disclosure'],
                ['nda'],
                ['保密义务', '保密信息'],
                ['商业秘密', '保密期限'],
            ],
        },
        {
            type: 'construction',
            label: '承揽/建设工程合同',
            patterns: [
                ['建设工程'],
                ['施工合同'],
                ['发包人', '承包人', '工程'],
                ['承揽人', '定作人'],
                ['工程款', '竣工', '施工'],
            ],
        },
        {
            type: 'service',
            label: '服务/委托合同',
            patterns: [
                ['服务合同'],
                ['委托合同'],
                ['服务费', '服务内容', '服务期限'],
                ['受托人', '委托人'],
                ['咨询服务', '技术服务'],
            ],
        },
        {
            type: 'sale',
            label: '买卖合同',
            patterns: [
                ['买卖合同', '购销合同'],
                ['采购合同'],
                ['出卖人', '买受人'],
                ['货款', '交货', '货物'],
                ['购买', '销售', '价款'],
            ],
        },
    ];

/**
 * 检测合同类型
 * @param text 合同全文（前 3000 字符即可，避免过长）
 */
export function detectContractType(text: string): ContractDetectResult {
    const sample = text.slice(0, 3000).toLowerCase();

    let bestMatch: { type: ContractType; label: string; score: number } | null = null;

    for (const rule of CONTRACT_RULES) {
        let ruleScore = 0;
        for (const patternGroup of rule.patterns) {
            const allMatch = patternGroup.every((kw) => sample.includes(kw.toLowerCase()));
            if (allMatch) ruleScore++;
        }
        if (ruleScore > 0) {
            if (!bestMatch || ruleScore > bestMatch.score) {
                bestMatch = { type: rule.type, label: rule.label, score: ruleScore };
            }
        }
    }

    if (!bestMatch) {
        return { type: 'general', label: '通用合同', confidence: 'low' };
    }
    return {
        type: bestMatch.type,
        label: bestMatch.label,
        confidence: bestMatch.score >= 2 ? 'high' : 'medium',
    };
}
