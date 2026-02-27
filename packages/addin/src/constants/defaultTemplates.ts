// This file provides the default templates extracted from the backend for frontend UI reference.
import type { ReviewTemplate } from '../types/settings';

export type ContractType =
    | 'sale'
    | 'labor'
    | 'lease'
    | 'service'
    | 'loan'
    | 'nda'
    | 'construction'
    | 'unknown';

export const CONTRACT_TYPE_OPTIONS: Array<{ id: ContractType; label: string }> = [
    { id: 'unknown', label: '通用合同' },
    { id: 'sale', label: '买卖合同' },
    { id: 'labor', label: '劳动合同' },
    { id: 'lease', label: '租赁合同' },
    { id: 'service', label: '服务合同/委托合同' },
    { id: 'loan', label: '借款合同' },
    { id: 'nda', label: '保密协议(NDA)' },
    { id: 'construction', label: '建设工程合同' },
];

export const BUILTIN_TEMPLATES: ReviewTemplate[] = [
    {
        id: 'builtin-unknown',
        name: '通用合同审查',
        isBuiltin: true,
        boundContractType: 'unknown',
        prompt: ''
    },
    {
        id: 'builtin-sale',
        name: '买卖合同审查',
        isBuiltin: true,
        boundContractType: 'sale',
        prompt: `---

## 买卖合同专项审查重点
- **标的物质量**：质量标准是否明确（国标/行标/企标/样品），验收标准和异议期是否约定
- **价款与支付**：价款构成（含税/不含税）、支付节点、迟延付款违约金
- **所有权转移**：货物所有权和风险何时转移，与交付方式的衔接
- **数量短缺与瑕疵**：数量不足/质量瑕疵的索赔期限和程序
- **包装与运输**：包装标准、运输费用负担、保险安排`
    },
    {
        id: 'builtin-labor',
        name: '劳动合同审查',
        isBuiltin: true,
        boundContractType: 'labor',
        prompt: `---

## 劳动合同专项审查重点
- **试用期合法性**：试用期期限是否符合《劳动合同法》第19条限制；试用期工资不低于80%
- **竞业限制**：补偿金标准（不低于月薪30%）、范围和期限（≤2年）是否合理
- **加班与薪酬**：加班工资计算基数、平时/休息日/法定节假日倍数是否合法
- **社会保险**：五险一金约定，是否存在自愿放弃社保等无效条款
- **解除与经济补偿**：解除条件是否公平，经济补偿金标准是否符合法定要求`
    },
    {
        id: 'builtin-lease',
        name: '租赁合同审查',
        isBuiltin: true,
        boundContractType: 'lease',
        prompt: `---

## 租赁合同专项审查重点
- **租赁物现状**：交付时的现状、设施清单、瑕疵告知义务
- **租金与押金**：租金调整机制、押金退还条件和期限
- **维修责任**：日常维修、大修的责任划分
- **转租限制**：是否允许转租，转租须经出租人同意的约定
- **优先续租/优先购买权**：是否赋予承租人优先权
- **非正常损耗**：何为自然损耗，何为赔偿责任`
    },
    {
        id: 'builtin-service',
        name: '服务/委托合同审查',
        isBuiltin: true,
        boundContractType: 'service',
        prompt: `---

## 服务/委托合同专项审查重点
- **服务范围界定**：服务内容是否清晰可量化，避免"按需提供"等模糊表述
- **验收标准**：服务成果的验收标准和程序，验收期限
- **知识产权归属**：服务过程中产生的成果、工具的知识产权归属
- **保密条款**：适用范围、保密期限、泄露违约责任
- **分包/转委托**：是否允许分包，分包责任承担`
    },
    {
        id: 'builtin-loan',
        name: '借款合同审查',
        isBuiltin: true,
        boundContractType: 'loan',
        prompt: `---

## 借款合同专项审查重点
- **利率合法性**：利率不超过LPR的4倍（年利率≤15.4%），复利约定效力
- **担保有效性**：抵押/质押物的设定程序、登记，保证人资格
- **提前还款**：提前还款权利，是否有违约金
- **逾期利率**：逾期罚息标准，债务加速到期条款
- **资金用途**：借款用途限制，挪用的违约后果`
    },
    {
        id: 'builtin-nda',
        name: '保密协议审查',
        isBuiltin: true,
        boundContractType: 'nda',
        prompt: `---

## 保密协议专项审查重点
- **保密信息范围**：定义是否过宽（应限于特定商业秘密），避免"一切信息均保密"
- **例外情形**：已公知信息、法定披露、自行研发的排除
- **保密期限**：期限是否合理（永久保密条款的执行风险）
- **违约救济**：赔偿金额是否可量化，是否包含申请禁令救济的权利
- **员工约束机制**：被披露方如何确保员工遵守保密义务`
    },
    {
        id: 'builtin-construction',
        name: '建设工程合同审查',
        isBuiltin: true,
        boundContractType: 'construction',
        prompt: `---

## 建设工程合同专项审查重点
- **资质与许可**：承包人资质、施工许可证、安全生产许可证
- **工程款支付**：进度款节点、结算周期，是否有背靠背付款条款
- **工期与顺延**：工期顺延条件（甲方原因、不可抗力），逾期竣工违约金上限
- **质量保证金**：保证金比例（不超过3%）、缺陷责任期和退还时间
- **设计变更与索赔**：变更程序、索赔通知期限（逾期丧失索赔权的风险）
- **优先受偿权**：建设工程价款优先受偿权的行使期限（竣工/合同约定完工之日起18个月）`
    }
];

export function getDefaultTemplatePrompt(id: string): string {
    const template = BUILTIN_TEMPLATES.find(t => t.id === id);
    return template ? template.prompt : '';
}
