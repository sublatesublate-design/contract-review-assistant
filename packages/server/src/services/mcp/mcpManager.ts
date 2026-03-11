/**
 * mcpManager.ts
 * MCP 客户端管理器（单例）
 * 管理多个 MCP Server 连接，提供工具列表和工具调用
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// SSE transport is optional; we'll only import it if needed
import { type McpServerConfig, loadMcpConfigs, saveMcpConfigs } from './mcpConfig';
import { convertMcpTools, type ToolDefinition, type McpToolDescription } from './toolConverter';

interface ConnectedServer {
    config: McpServerConfig;
    client: Client;
    tools: ToolDefinition[];
}

class McpManager {
    private servers: Map<string, ConnectedServer> = new Map();
    private initialized = false;

    /**
     * 初始化：加载配置并连接所有已启用的 MCP 服务器
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        const configs = loadMcpConfigs();
        for (const config of configs) {
            if (config.enabled) {
                try {
                    await this.connectServer(config);
                } catch (err) {
                    console.error(`[MCP] 连接服务器 "${config.name}" 失败:`, err);
                }
            }
        }
        console.log(`[MCP] 已初始化，连接了 ${this.servers.size} 个服务器`);
    }

    /**
     * 连接一个 MCP 服务器
     */
    async connectServer(config: McpServerConfig): Promise<void> {
        // 如果已连接，先断开
        if (this.servers.has(config.id)) {
            await this.disconnectServer(config.id);
        }

        const client = new Client(
            { name: 'contract-review-assistant', version: '2.1.0' },
            { capabilities: {} }
        );

        let transport: StdioClientTransport;

        if (config.transport === 'stdio') {
            if (!config.command) {
                throw new Error(`服务器 "${config.name}" 未指定 command`);
            }
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
            });
        } else {
            throw new Error(`传输方式 "${config.transport}" 暂不支持，请使用 stdio`);
        }

        await client.connect(transport);

        // 获取工具列表
        const toolsResult = await client.listTools();
        const tools = convertMcpTools(
            toolsResult.tools as McpToolDescription[],
            config.id
        );

        this.servers.set(config.id, { config, client, tools });
        console.log(`[MCP] 已连接 "${config.name}"，可用工具 ${tools.length} 个`);
    }

    /**
     * 断开一个 MCP 服务器
     */
    async disconnectServer(serverId: string): Promise<void> {
        const server = this.servers.get(serverId);
        if (server) {
            try {
                await server.client.close();
            } catch {
                // 忽略关闭错误
            }
            this.servers.delete(serverId);
        }
    }

    /**
     * 列出所有可用工具
     */
    listAllTools(): ToolDefinition[] {
        const allTools: ToolDefinition[] = [];
        for (const server of this.servers.values()) {
            allTools.push(...server.tools);
        }
        return allTools;
    }

    /**
     * 调用工具（通过全局工具名路由到正确的 MCP 服务器）
     */
    async callTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<{ content: string; isError?: boolean }> {
        // 从工具名解析出 serverId 和原始工具名
        const allTools = this.listAllTools();
        const tool = allTools.find((t) => t.name === toolName);

        if (!tool) {
            return { content: `工具 "${toolName}" 不存在`, isError: true };
        }

        const server = this.servers.get(tool.serverId);
        if (!server) {
            return { content: `MCP 服务器 "${tool.serverId}" 未连接`, isError: true };
        }

        try {
            const result = await server.client.callTool({
                name: tool.originalName,
                arguments: args,
            });

            // 将结果转为字符串
            const textContent = (result.content as Array<{ type: string; text?: string }>)
                .filter((c) => c.type === 'text')
                .map((c) => c.text || '')
                .join('\n');

            return { content: textContent || JSON.stringify(result.content), isError: !!result.isError };
        } catch (err) {
            return {
                content: `调用工具 "${tool.originalName}" 失败: ${err instanceof Error ? err.message : String(err)}`,
                isError: true,
            };
        }
    }

    /**
     * 添加 MCP 服务器配置并连接
     */
    async addServer(config: McpServerConfig): Promise<void> {
        const configs = loadMcpConfigs();
        const existing = configs.findIndex((c) => c.id === config.id);
        if (existing >= 0) {
            configs[existing] = config;
        } else {
            configs.push(config);
        }
        saveMcpConfigs(configs);

        if (config.enabled) {
            await this.connectServer(config);
        }
    }

    /**
     * 删除 MCP 服务器
     */
    async removeServer(serverId: string): Promise<void> {
        await this.disconnectServer(serverId);
        const configs = loadMcpConfigs().filter((c) => c.id !== serverId);
        saveMcpConfigs(configs);
    }

    /**
     * 获取所有配置（含连接状态）
     */
    getServersStatus(): Array<McpServerConfig & { connected: boolean; toolCount: number }> {
        const configs = loadMcpConfigs();
        return configs.map((c) => {
            const server = this.servers.get(c.id);
            return {
                ...c,
                connected: !!server,
                toolCount: server?.tools.length ?? 0,
            };
        });
    }
}

// 导出单例
export const mcpManager = new McpManager();
