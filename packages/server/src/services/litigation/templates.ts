import type { ComplaintCaseTypeKey } from '../../types/elementComplaint';
import type {
    ComplaintTemplateBlockDefinition,
    ComplaintTemplateDefinition,
    ComplaintTemplateRowDefinition,
} from './types';

function tableBlock(
    type: 'party-table' | 'claim-table' | 'fact-table' | 'tail-table',
    title: string,
    rows: ComplaintTemplateRowDefinition[],
): ComplaintTemplateBlockDefinition {
    return { type, title, rows };
}

const COMMON_ENTITY_PARTY_ROWS: ComplaintTemplateRowDefinition[] = [
    { key: 'plaintiff_natural', label: '原告（自然人）', hint: '姓名、性别、民族、出生年月日、住所地、身份证号、联系方式等' },
    { key: 'plaintiff_legal', label: '原告（法人、非法人组织）', hint: '名称、住所地、统一社会信用代码、法定代表人或负责人、联系方式等' },
    { key: 'plaintiff_agent', label: '委托诉讼代理人', hint: '姓名、律师事务所、联系方式等' },
    { key: 'defendant_natural', label: '被告（自然人）', hint: '姓名、性别、民族、出生年月日、住所地、身份证号、联系方式等' },
    { key: 'defendant_legal', label: '被告（法人、非法人组织）', hint: '名称、住所地、统一社会信用代码、法定代表人或负责人、联系方式等' },
    { key: 'third_party_natural', label: '第三人（自然人）', hint: '姓名、性别、民族、出生年月日、住所地、身份证号、联系方式等' },
    { key: 'third_party_legal', label: '第三人（法人、非法人组织）', hint: '名称、住所地、统一社会信用代码、法定代表人或负责人、联系方式等' },
];

const COMMON_MEDIATION_ROWS: ComplaintTemplateRowDefinition[] = [
    { key: 'mediation_willingness', label: '是否同意调解', hint: '同意□ 不同意□ 其他：' },
];

const COMMON_GENERAL_PARTY_ROWS: ComplaintTemplateRowDefinition[] = [
    { key: 'plaintiff_info', label: '原告信息', hint: '姓名/名称、身份信息、住所地、联系方式等' },
    { key: 'plaintiff_agent', label: '委托诉讼代理人', hint: '姓名、律师事务所、联系方式等' },
    { key: 'defendant_info', label: '被告信息', hint: '姓名/名称、身份信息、住所地、联系方式等' },
    { key: 'third_party_info', label: '第三人信息', hint: '姓名/名称、身份信息、住所地、联系方式等' },
];

const DIVORCE_TEMPLATE: ComplaintTemplateDefinition = {
    caseType: 'divorce',
    label: '离婚纠纷',
    instructions: '说明：为了方便您填写，请按照本表逐项填写。事实与理由部分请围绕婚姻关系、子女抚养、共同财产、共同债务及其他争议事项如实填写，无法确定的项目可以留空。',
    detection: {
        keywords: ['离婚', '婚姻关系', '子女抚养', '共同财产', '共同债务', '抚养费', '探望权'],
        negativeKeywords: ['买卖', '借款', '交通事故', '机动车', '保险合同'],
    },
    blocks: [
        tableBlock('party-table', '当事人信息', [
            { key: 'plaintiff_info', label: '原告', hint: '姓名、性别、民族、出生年月日、身份证号、住所地、联系方式等' },
            { key: 'plaintiff_agent', label: '委托诉讼代理人', hint: '姓名、律师事务所、联系方式等' },
            { key: 'defendant_info', label: '被告', hint: '姓名、性别、民族、出生年月日、身份证号、住所地、联系方式等' },
        ]),
        tableBlock('claim-table', '诉讼请求', [
            { key: 'claim_divorce', label: '1. 解除婚姻关系', hint: '是否请求解除婚姻关系' },
            { key: 'claim_property', label: '2. 夫妻共同财产', hint: '分割请求及具体财产内容' },
            { key: 'claim_debt', label: '3. 夫妻共同债务', hint: '承担方式及具体债务内容' },
            { key: 'claim_child_custody', label: '4. 子女直接抚养', hint: '直接抚养归属及协助义务' },
            { key: 'claim_child_support', label: '5. 子女抚养费', hint: '金额、支付方式、期限' },
            { key: 'claim_visitation', label: '6. 探望权', hint: '探望时间、方式、地点' },
            { key: 'claim_compensation', label: '7. 离婚损害赔偿/经济补偿/经济帮助', hint: '具体请求内容与数额' },
            { key: 'claim_costs', label: '8. 是否主张诉讼费用', hint: '承担方式' },
            { key: 'claim_other', label: '9. 其他请求', hint: '其他需要法院处理的事项' },
        ]),
        tableBlock('tail-table', '诉前保全', [
            { key: 'pre_preservation', label: '是否已经诉前保全', hint: '是□ 否□ 具体情况：' },
        ]),
        tableBlock('fact-table', '事实与理由', [
            { key: 'fact_marriage', label: '1. 婚姻关系及家庭基本情况', hint: '结婚时间、登记机关、家庭成员情况等' },
            { key: 'fact_breakdown', label: '2. 婚姻破裂原因', hint: '分居、感情不和、家庭矛盾等' },
            { key: 'fact_children', label: '3. 子女情况', hint: '子女姓名、年龄、抚养现状' },
            { key: 'fact_property', label: '4. 共同财产情况', hint: '主要财产、取得时间、现状' },
            { key: 'fact_debt', label: '5. 共同债务情况', hint: '债务形成原因、金额、承担情况' },
            { key: 'fact_support', label: '6. 抚养与探望安排', hint: '抚养能力、探望安排、协商情况' },
            { key: 'fact_compensation', label: '7. 离婚损害赔偿/经济补偿/经济帮助依据', hint: '请求依据与具体事实' },
            { key: 'fact_other', label: '8. 其他需要说明的情况', hint: '其他重要事实' },
            { key: 'fact_legal_basis', label: '9. 请求依据', hint: '法律依据或裁判规则' },
            { key: 'fact_evidence', label: '10. 证据清单（可另附页）', hint: '证据名称、证明目的' },
        ]),
        tableBlock('tail-table', '调解意愿', COMMON_MEDIATION_ROWS),
    ],
};

const SALE_TEMPLATE: ComplaintTemplateDefinition = {
    caseType: 'sale',
    label: '买卖合同纠纷',
    instructions: '说明：请围绕买卖合同签订、履行、付款、交货、质量争议、违约责任及担保情况逐项填写。无法确定的项目可以留空。',
    detection: {
        keywords: ['买卖', '购销', '价款', '交货', '标的物', '违约金', '验收'],
        negativeKeywords: ['离婚', '借款', '交通事故', '机动车', '保险合同'],
    },
    blocks: [
        tableBlock('party-table', '当事人信息', COMMON_ENTITY_PARTY_ROWS),
        tableBlock('claim-table', '诉讼请求', [
            { key: 'claim_price', label: '1. 给付价款（元）', hint: '本金/价款数额' },
            { key: 'claim_interest', label: '2. 迟延给付价款的利息（违约金）', hint: '计算方式、起算日、截止日' },
            { key: 'claim_loss', label: '3. 赔偿因卖方违约所受的损失', hint: '具体损失内容及金额' },
            { key: 'claim_defect', label: '4. 是否对标的物的瑕疵承担责任', hint: '修理、更换、退货、折价等' },
            { key: 'claim_performance', label: '5. 要求继续履行或者解除合同', hint: '履行请求或解除请求' },
            { key: 'claim_security', label: '6. 是否主张担保权利', hint: '抵押、质押、保证等' },
            { key: 'claim_collection_costs', label: '7. 是否主张实现债权的费用', hint: '律师费、保全费、公告费等' },
            { key: 'claim_costs', label: '8. 是否主张诉讼费用', hint: '承担方式' },
            { key: 'claim_other', label: '9. 其他请求', hint: '其他需要法院处理的事项' },
            { key: 'claim_total', label: '10. 标的总额', hint: '请求总额及计算口径' },
        ]),
        tableBlock('tail-table', '约定管辖和诉前保全', [
            { key: 'jurisdiction', label: '1. 有无仲裁、法院管辖约定', hint: '有□ 无□ 具体约定：' },
            { key: 'pre_preservation', label: '2. 是否已经诉前保全', hint: '是□ 否□ 具体情况：' },
        ]),
        tableBlock('fact-table', '事实与理由', [
            { key: 'fact_contract', label: '1. 合同的签订情况', hint: '签订时间、地点、名称、主要条款' },
            { key: 'fact_parties', label: '2. 合同主体', hint: '买卖双方身份、关系、授权情况' },
            { key: 'fact_subject', label: '3. 买卖标的物情况', hint: '种类、型号、数量、规格、质量' },
            { key: 'fact_price', label: '4. 合同约定的价格及支付方式', hint: '价款、付款节点、支付方式' },
            { key: 'fact_delivery', label: '5. 交货、安装、调试、验收等约定', hint: '时间、地点、方式、风险承担' },
            { key: 'fact_quality', label: '6. 质量标准及检验方式', hint: '质量标准、异议期限、验收规则' },
            { key: 'fact_breach', label: '7. 违约金（定金）约定', hint: '违约金、定金、承担方式' },
            { key: 'fact_performance_state', label: '8. 价款支付及标的物交付情况', hint: '履行进度、未履行部分' },
            { key: 'fact_delay', label: '9. 是否存在迟延履行', hint: '迟延一方、迟延期间、后果' },
            { key: 'fact_reminder', label: '10. 是否催促过履行', hint: '催告时间、方式、内容' },
            { key: 'fact_quality_dispute', label: '11. 买卖合同标的物有无质量争议', hint: '争议点、发现时间' },
            { key: 'fact_nonconformity', label: '12. 标的物质量规格或履行方式是否不符合约定', hint: '不符合约定的具体内容' },
            { key: 'fact_negotiation', label: '13. 是否曾就标的物质量问题进行协商', hint: '协商时间、结果' },
            { key: 'fact_rescission_notice', label: '14. 是否通知解除合同', hint: '通知时间、方式、理由' },
            { key: 'fact_damages', label: '15. 被告应当支付的利息、违约金、赔偿金', hint: '计算口径及数额' },
            { key: 'fact_security_contract', label: '16. 是否签订物的担保（抵押、质押）合同', hint: '抵押或质押情况' },
            { key: 'fact_security_subject', label: '17. 担保人、担保物', hint: '担保人、担保物名称、范围' },
            { key: 'fact_max_security', label: '18. 是否最高额担保（抵押、质押）', hint: '是□ 否□ 担保额度与确定时间' },
            { key: 'fact_security_registration', label: '19. 是否办理抵押、质押登记', hint: '登记情况、登记机关' },
            { key: 'fact_guarantee_contract', label: '20. 是否签订保证合同', hint: '保证人、签订时间' },
            { key: 'fact_guarantee_mode', label: '21. 保证方式', hint: '一般保证□ 连带责任保证□' },
            { key: 'fact_other_security', label: '22. 其他担保方式', hint: '其他担保安排' },
            { key: 'fact_basis', label: '23. 请求承担责任的依据', hint: '合同、法律规定、证据指向' },
            { key: 'fact_other', label: '24. 其他需要说明的内容（可另附页）', hint: '补充说明' },
            { key: 'fact_evidence', label: '25. 证据清单（可另附页）', hint: '证据名称、证明目的' },
        ]),
        tableBlock('tail-table', '调解意愿', COMMON_MEDIATION_ROWS),
    ],
};

const PRIVATE_LOAN_TEMPLATE: ComplaintTemplateDefinition = {
    caseType: 'private_loan',
    label: '民间借贷纠纷',
    instructions: '说明：请围绕借贷合意、借款交付、利息约定、还款情况、逾期情况、担保安排及证据材料逐项填写。无法确定的项目可以留空。',
    detection: {
        keywords: ['借款', '借贷', '还款', '借条', '欠条', '利息', '出借'],
        negativeKeywords: ['银行', '金融机构', '信用卡', '消费贷', '贷款合同'],
    },
    blocks: [
        tableBlock('party-table', '当事人信息', COMMON_ENTITY_PARTY_ROWS),
        tableBlock('claim-table', '诉讼请求', [
            { key: 'claim_principal', label: '1. 本金', hint: '借款本金数额' },
            { key: 'claim_interest', label: '2. 利息', hint: '约定利息、逾期利息、起算日与截止日' },
            { key: 'claim_early_repayment', label: '3. 是否要求提前还款或解除合同', hint: '是否主张提前到期、解除等' },
            { key: 'claim_security', label: '4. 是否主张担保权利', hint: '抵押、质押、保证等' },
            { key: 'claim_collection_costs', label: '5. 是否主张实现债权的费用', hint: '律师费、保全费、公告费等' },
            { key: 'claim_costs', label: '6. 是否主张诉讼费用', hint: '承担方式' },
            { key: 'claim_other', label: '7. 其他请求', hint: '其他需要法院处理的事项' },
            { key: 'claim_total', label: '8. 标的总额', hint: '请求总额及计算口径' },
        ]),
        tableBlock('tail-table', '约定管辖和诉前保全', [
            { key: 'jurisdiction', label: '1. 有无仲裁、法院管辖约定', hint: '有□ 无□ 具体约定：' },
            { key: 'pre_preservation', label: '2. 是否已经诉前保全', hint: '是□ 否□ 具体情况：' },
        ]),
        tableBlock('fact-table', '事实与理由', [
            { key: 'fact_contract', label: '1. 合同签订情况', hint: '借条、借款合同、聊天记录等形成情况' },
            { key: 'fact_parties', label: '2. 签订主体', hint: '出借人、借款人、关系、授权情况' },
            { key: 'fact_amount', label: '3. 借款金额', hint: '约定金额、实际交付金额、交付方式' },
            { key: 'fact_term', label: '4. 借款期限', hint: '起止时间、到期日' },
            { key: 'fact_interest', label: '5. 借款利率', hint: '约定利率、计算方式' },
            { key: 'fact_delivery_time', label: '6. 借款提供时间', hint: '交付日期、交付凭证' },
            { key: 'fact_repayment_method', label: '7. 还款方式', hint: '按月付息、到期还本、其他约定' },
            { key: 'fact_repayment_state', label: '8. 还款情况', hint: '已还本金、已还利息、剩余欠款' },
            { key: 'fact_overdue', label: '9. 是否存在逾期还款', hint: '逾期时间、金额、后果' },
            { key: 'fact_security_contract', label: '10. 是否签订物的担保（抵押、质押）合同', hint: '抵押或质押情况' },
            { key: 'fact_security_subject', label: '11. 担保人、担保物', hint: '担保人、担保物名称、范围' },
            { key: 'fact_max_security', label: '12. 是否最高额担保（抵押、质押）', hint: '是□ 否□ 担保额度与确定时间' },
            { key: 'fact_security_registration', label: '13. 是否办理抵押、质押登记', hint: '登记情况、登记机关' },
            { key: 'fact_guarantee_contract', label: '14. 是否签订保证合同', hint: '保证人、签订时间' },
            { key: 'fact_other_security', label: '15. 其他担保方式', hint: '其他担保安排' },
            { key: 'fact_other', label: '16. 其他需要说明的内容（可另附页）', hint: '补充说明' },
            { key: 'fact_basis', label: '17. 请求依据', hint: '合同、法律规定、证据指向' },
            { key: 'fact_evidence', label: '18. 证据清单（可另附页）', hint: '证据名称、证明目的' },
        ]),
        tableBlock('tail-table', '调解意愿', COMMON_MEDIATION_ROWS),
    ],
};

const TRAFFIC_TEMPLATE: ComplaintTemplateDefinition = {
    caseType: 'traffic',
    label: '机动车交通事故责任纠纷',
    instructions: '说明：请围绕交通事故发生经过、责任认定、损失项目、保险情况、诉前保全及鉴定申请逐项填写。无法确定的项目可以留空。',
    detection: {
        keywords: ['交通事故', '机动车', '交强险', '商业险', '责任认定', '保险公司', '碰撞'],
        negativeKeywords: ['离婚', '借款', '买卖', '劳动争议', '房屋买卖'],
    },
    blocks: [
        tableBlock('party-table', '当事人信息', COMMON_ENTITY_PARTY_ROWS),
        tableBlock('claim-table', '诉讼请求', [
            { key: 'claim_medical', label: '1. 医疗费', hint: '金额、已支付情况' },
            { key: 'claim_nursing', label: '2. 护理费', hint: '金额、计算方式' },
            { key: 'claim_nutrition', label: '3. 营养费', hint: '金额、计算依据' },
            { key: 'claim_hospital_food', label: '4. 住院伙食补助费', hint: '金额、住院天数' },
            { key: 'claim_lost_wages', label: '5. 误工费', hint: '误工期间、收入标准' },
            { key: 'claim_transport', label: '6. 交通费', hint: '金额、票据情况' },
            { key: 'claim_disability', label: '7. 残疾赔偿金（含被扶养人生活费）', hint: '伤残等级、扶养情况' },
            { key: 'claim_aids', label: '8. 残疾辅助器具费', hint: '器具名称、金额' },
            { key: 'claim_death', label: '9. 死亡赔偿金、丧葬费', hint: '适用于死亡案件' },
            { key: 'claim_moral', label: '10. 精神损害抚慰金', hint: '金额及依据' },
            { key: 'claim_property_loss', label: '11. 财产损失', hint: '车辆维修、物品损失等' },
            { key: 'claim_other_costs', label: '12. 其他费用', hint: '其他可赔项目' },
            { key: 'claim_total', label: '13. 标的总额', hint: '请求总额及计算口径' },
        ]),
        tableBlock('tail-table', '诉前保全及鉴定申请', [
            { key: 'pre_preservation', label: '1. 是否已经诉前保全', hint: '是□ 否□ 具体情况：' },
            { key: 'appraisal', label: '2. 是否申请鉴定', hint: '是□ 否□ 鉴定项目：' },
        ]),
        tableBlock('fact-table', '事实与理由', [
            { key: 'fact_accident', label: '1. 交通事故发生情况', hint: '时间、地点、经过、车辆信息' },
            { key: 'fact_liability', label: '2. 交通事故责任认定', hint: '责任认定书内容、责任比例' },
            { key: 'fact_insurance', label: '3. 机动车投保情况', hint: '交强险、商业险、保险公司' },
            { key: 'fact_basis', label: '4. 请求依据', hint: '法律依据与责任承担理由' },
            { key: 'fact_evidence', label: '5. 证据清单（可另附页）', hint: '证据名称、证明目的' },
        ]),
        tableBlock('tail-table', '调解意愿', COMMON_MEDIATION_ROWS),
    ],
};

const GENERAL_TEMPLATE: ComplaintTemplateDefinition = {
    caseType: 'general',
    label: '通用民事纠纷',
    instructions: '说明：本模板适用于暂未识别或未覆盖的民事纠纷。请尽量围绕当事人信息、争议焦点、事实经过、法律依据、证据材料及调解意愿逐项填写。',
    detection: {
        keywords: [],
    },
    blocks: [
        tableBlock('party-table', '当事人信息', COMMON_GENERAL_PARTY_ROWS),
        tableBlock('claim-table', '诉讼请求', [
            { key: 'claim_request_1', label: '1. 诉讼请求一', hint: '主要请求' },
            { key: 'claim_request_2', label: '2. 诉讼请求二', hint: '次要请求或备选请求' },
            { key: 'claim_request_3', label: '3. 诉讼请求三', hint: '其他请求' },
            { key: 'claim_request_4', label: '4. 诉讼请求四', hint: '其他请求' },
            { key: 'claim_request_5', label: '5. 诉讼请求五', hint: '其他请求' },
            { key: 'claim_costs', label: '6. 是否主张诉讼费用', hint: '承担方式' },
            { key: 'claim_other', label: '7. 其他请求', hint: '其他需要法院处理的事项' },
        ]),
        tableBlock('fact-table', '事实与理由', [
            { key: 'fact_contract_or_event', label: '1. 争议关系或事件经过', hint: '时间、地点、经过、主要事实' },
            { key: 'fact_performance', label: '2. 履行或争议处理经过', hint: '履行情况、协商情况、争议焦点' },
            { key: 'fact_basis', label: '3. 法律依据', hint: '法律、法规、合同约定或裁判规则' },
            { key: 'fact_evidence', label: '4. 证据清单', hint: '证据名称、证明目的' },
            { key: 'fact_other', label: '5. 其他需要说明的内容', hint: '补充说明' },
        ]),
        tableBlock('tail-table', '调解意愿', COMMON_MEDIATION_ROWS),
    ],
};

export const COMPLAINT_TEMPLATE_DEFINITIONS: ReadonlyArray<ComplaintTemplateDefinition> = [
    DIVORCE_TEMPLATE,
    SALE_TEMPLATE,
    PRIVATE_LOAN_TEMPLATE,
    TRAFFIC_TEMPLATE,
    GENERAL_TEMPLATE,
];

export const COMPLAINT_TEMPLATE_LABELS: Record<ComplaintCaseTypeKey, string> = {
    divorce: DIVORCE_TEMPLATE.label,
    sale: SALE_TEMPLATE.label,
    private_loan: PRIVATE_LOAN_TEMPLATE.label,
    traffic: TRAFFIC_TEMPLATE.label,
    general: GENERAL_TEMPLATE.label,
};

export function getComplaintTemplate(caseType: ComplaintCaseTypeKey): ComplaintTemplateDefinition {
    return COMPLAINT_TEMPLATE_DEFINITIONS.find((template) => template.caseType === caseType) ?? GENERAL_TEMPLATE;
}
