import type { ReviewTemplate } from '../types/settings';

export type ContractSubtype =
    | 'unknown'
    | 'sale'
    | 'labor'
    | 'lease'
    | 'service'
    | 'loan'
    | 'nda'
    | 'construction';

export const CONTRACT_TYPE_OPTIONS: Array<{ id: ContractSubtype; label: string }> = [
    { id: 'unknown', label: '通用合同' },
    { id: 'sale', label: '买卖合同' },
    { id: 'labor', label: '劳动合同' },
    { id: 'lease', label: '租赁合同' },
    { id: 'service', label: '服务/委托合同' },
    { id: 'loan', label: '借款合同' },
    { id: 'nda', label: '保密协议' },
    { id: 'construction', label: '建设工程合同' },
];

export const BUILTIN_TEMPLATES: ReviewTemplate[] = [
    {
        id: 'builtin-contract-general',
        name: '通用合同审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'unknown',
        prompt: '',
    },
    {
        id: 'builtin-sale',
        name: '买卖合同审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'sale',
        prompt: `---

## 买卖合同专项审查重点
- 标的物质量标准、验收规则与异议期是否明确
- 价款构成、付款节点、税费承担与发票义务是否清晰
- 所有权与风险转移时点是否衔接一致
- 瑕疵、短缺、迟延交货的责任与索赔流程是否完整
- 违约责任与争议解决条款是否可执行`,
    },
    {
        id: 'builtin-labor',
        name: '劳动合同审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'labor',
        prompt: `---

## 劳动合同专项审查重点
- 试用期、工资标准、社保公积金是否符合强制性规定
- 竞业限制范围、期限和补偿标准是否合理
- 加班、休假、调岗、解除条件是否约定清楚
- 是否存在免除用人单位法定义务的无效条款
- 经济补偿与违约责任条款是否符合法律要求`,
    },
    {
        id: 'builtin-lease',
        name: '租赁合同审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'lease',
        prompt: `---

## 租赁合同专项审查重点
- 租赁物交付状态、设施清单与用途限制是否明确
- 租金、押金、递增机制与退还条件是否清晰
- 维修责任、大修责任与损耗边界是否划分明确
- 转租、装修、优先续租等核心安排是否完整
- 违约解除、腾退交还与争议解决条款是否可执行`,
    },
    {
        id: 'builtin-service',
        name: '服务/委托合同审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'service',
        prompt: `---

## 服务/委托合同专项审查重点
- 服务范围、交付成果与验收标准是否可量化
- 服务费、结算节点、开票义务和违约责任是否清晰
- 知识产权、保密、分包转委托条款是否合理
- 服务期限、终止机制与过渡安排是否完整
- 风险分配是否明显偏向单方`,
    },
    {
        id: 'builtin-loan',
        name: '借款合同审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'loan',
        prompt: `---

## 借款合同专项审查重点
- 利率、罚息、复利约定是否合法
- 借款用途、提款条件、还款安排是否清晰
- 抵押、质押、保证等担保条款是否有效可执行
- 提前到期、提前还款、违约处置机制是否合理
- 是否存在明显过高的违约成本`,
    },
    {
        id: 'builtin-nda',
        name: '保密协议审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'nda',
        prompt: `---

## 保密协议专项审查重点
- 保密信息范围是否过宽或缺少例外情形
- 保密期限、披露限制与返还销毁义务是否明确
- 违约责任、禁令救济和损失举证是否合理
- 员工、关联方、第三方接触信息的约束机制是否完整`,
    },
    {
        id: 'builtin-construction',
        name: '建设工程合同审校',
        isBuiltin: true,
        documentType: 'contract',
        boundDocumentSubtype: 'construction',
        prompt: `---

## 建设工程合同专项审查重点
- 承包资质、施工许可与工程范围是否明确
- 工期、顺延、变更与索赔流程是否可执行
- 进度款、结算、质保金与优先受偿权安排是否合理
- 质量责任、安全责任与竣工验收机制是否完整`,
    },
    {
        id: 'builtin-litigation-general',
        name: '诉讼文书通用审校',
        isBuiltin: true,
        documentType: 'litigation',
        prompt: `---

## 诉讼文书通用审校重点
- 文书格式、法院名称、案由、当事人信息是否规范完整
- 事实时间线是否清晰，关键事实是否有证据支撑
- 法律依据与论证链条是否匹配
- 诉讼请求或答辩意见是否明确、完整、可执行
- 是否预判并回应了对方可能的主要抗辩`,
    },
    {
        id: 'builtin-civil-complaint',
        name: '民事起诉状审校',
        isBuiltin: true,
        documentType: 'litigation',
        prompt: `---

## 民事起诉状专项审校重点
- 原被告信息、管辖法院、案由、诉讼请求是否齐备
- 每项诉讼请求是否有清晰的事实基础与法律依据
- 是否遗漏利息、违约金、保全、律师费等附带请求
- 证据目录与事实主张是否一一对应
- 是否预判被告抗辩并提前回应`,
    },
    {
        id: 'builtin-defense',
        name: '答辩状/代理词审校',
        isBuiltin: true,
        documentType: 'litigation',
        prompt: `---

## 答辩状/代理词专项审校重点
- 是否准确回应对方全部核心主张
- 抗辩理由、证据材料和法律依据是否形成闭环
- 是否抓住请求基础、举证责任、时效、管辖等关键争点
- 论证是否存在跳步、结论先行或证据支撑不足`,
    },
    {
        id: 'builtin-opinion-general',
        name: '法律意见书通用审校',
        isBuiltin: true,
        documentType: 'legal_opinion',
        prompt: `---

## 法律意见书通用审校重点
- 结论措辞是否审慎，避免绝对化表述
- 假设前提、事实基础与限制条件是否写明
- 每项结论是否均有充分的法律依据和推理过程
- 引用法规是否现行有效，是否需要通过 MCP 校验
- 免责声明、适用范围和依赖材料说明是否完整`,
    },
    {
        id: 'builtin-due-diligence',
        name: '尽职调查报告审校',
        isBuiltin: true,
        documentType: 'legal_opinion',
        prompt: `---

## 尽职调查报告专项审校重点
- 风险事实是否陈述完整，来源材料是否交代清楚
- 是否区分已核实事实、待核实事项和专业判断
- 风险等级、影响范围与整改建议是否匹配
- 是否遗漏重大合规、诉讼、股权、许可等风险点`,
    },
    {
        id: 'builtin-compliance-opinion',
        name: '合规/交易法律意见审校',
        isBuiltin: true,
        documentType: 'legal_opinion',
        prompt: `---

## 合规/交易法律意见专项审校重点
- 核心结论是否过度确定，是否充分揭示条件与例外
- 项目背景、适用法律、分析步骤与结论是否前后对应
- 免责、适用对象、引用资料范围与出具前提是否完整
- 是否遗漏关键审批、授权、登记、信息披露等条件`,
    },
];

export function getDefaultTemplatePrompt(id: string): string {
    const template = BUILTIN_TEMPLATES.find(t => t.id === id);
    return template ? template.prompt : '';
}
