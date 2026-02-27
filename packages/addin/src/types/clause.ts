export interface ContractClause {
    id: string;
    /** 条款分类，如：违约责任、争议解决、保密条款等 */
    category: string;
    /** 条款标题，如：标准违约金条款 */
    title: string;
    /** 条款完整文本内容 */
    content: string;
    /** 是否是对所有用户均可见的内置条款 (用户自定义的为 false) */
    isBuiltin: boolean;
    /** (可选) 适用场景描述 */
    description?: string;
}
