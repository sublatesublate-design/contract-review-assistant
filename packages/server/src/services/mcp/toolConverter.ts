/**
 * toolConverter.ts
 * 将 MCP 工具描述转换为 Claude / OpenAI 的 tools 格式
 */

/** MCP 工具的标准描述（来自 @modelcontextprotocol/sdk） */
export interface McpToolDescription {
    name: string;
    description?: string;
    inputSchema: {
        type: 'object';
        properties?: Record<string, unknown>;
        required?: string[];
        [key: string]: unknown;
    };
}

/** 统一的内部工具定义（与 AI SDK 无关） */
export interface ToolDefinition {
    /** 全局唯一名称，格式: serverId__toolName */
    name: string;
    /** 工具描述 */
    description: string;
    /** JSON Schema 参数定义 */
    inputSchema: Record<string, unknown>;
    /** 所属 MCP 服务器 ID */
    serverId: string;
    /** 原始 MCP 工具名（用于调用） */
    originalName: string;
}

/**
 * 将 MCP 工具列表转为内部 ToolDefinition
 */
export function convertMcpTools(
    tools: McpToolDescription[],
    serverId: string
): ToolDefinition[] {
    return tools.map((t) => ({
        name: `${serverId}__${t.name}`,
        description: t.description || t.name,
        inputSchema: t.inputSchema as Record<string, unknown>,
        serverId,
        originalName: t.name,
    }));
}

/**
 * 转为 Anthropic Claude 的 tools 格式
 */
export function toClaudeTools(tools: ToolDefinition[]): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}> {
    return tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
    }));
}

/**
 * 转为 OpenAI 的 tools 格式
 */
export function toOpenAITools(tools: ToolDefinition[]): Array<{
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}> {
    return tools.map((t) => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
        },
    }));
}
