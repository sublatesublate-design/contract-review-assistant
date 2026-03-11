import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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

    async initialize(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        const configs = loadMcpConfigs();
        for (const config of configs) {
            if (!config.enabled) continue;

            try {
                await this.connectServer(config);
            } catch (err) {
                console.error(`[MCP] Failed to connect "${config.name}"`, err);
            }
        }
    }

    async connectServer(config: McpServerConfig): Promise<void> {
        if (this.servers.has(config.id)) {
            await this.disconnectServer(config.id);
        }

        if (!config.command) {
            throw new Error(`MCP server "${config.name}" is missing command`);
        }

        const client = new Client(
            { name: 'contract-review-assistant', version: '1.0.0' },
            { capabilities: {} }
        );

        const transport = new StdioClientTransport({
            command: config.command,
            args: config.args || [],
            env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
        });

        await client.connect(transport);

        const toolsResult = await client.listTools();
        const tools = convertMcpTools(toolsResult.tools as McpToolDescription[], config.id);

        this.servers.set(config.id, { config, client, tools });
    }

    async disconnectServer(serverId: string): Promise<void> {
        const server = this.servers.get(serverId);
        if (!server) return;

        try {
            await server.client.close();
        } catch {
            // Ignore close errors during cleanup.
        }

        this.servers.delete(serverId);
    }

    listAllTools(): ToolDefinition[] {
        const allTools: ToolDefinition[] = [];
        for (const server of this.servers.values()) {
            allTools.push(...server.tools);
        }
        return allTools;
    }

    async callTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<{ content: string; isError?: boolean }> {
        const tool = this.listAllTools().find((candidate) => candidate.name === toolName);
        if (!tool) {
            return { content: `Tool "${toolName}" does not exist`, isError: true };
        }

        const server = this.servers.get(tool.serverId);
        if (!server) {
            return { content: `MCP server "${tool.serverId}" is not connected`, isError: true };
        }

        try {
            const result = await server.client.callTool({
                name: tool.originalName,
                arguments: args,
            });

            const textContent = (result.content as Array<{ type: string; text?: string }>)
                .filter((content) => content.type === 'text')
                .map((content) => content.text || '')
                .join('\n');

            return { content: textContent || JSON.stringify(result.content), isError: !!result.isError };
        } catch (err) {
            return {
                content: `Calling tool "${tool.originalName}" failed: ${err instanceof Error ? err.message : String(err)}`,
                isError: true,
            };
        }
    }

    async addServer(config: McpServerConfig): Promise<void> {
        const configs = loadMcpConfigs();
        const existing = configs.findIndex((candidate) => candidate.id === config.id);
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

    async removeServer(serverId: string): Promise<void> {
        await this.disconnectServer(serverId);
        const configs = loadMcpConfigs().filter((config) => config.id !== serverId);
        saveMcpConfigs(configs);
    }

    getServersStatus(): Array<McpServerConfig & { connected: boolean; toolCount: number }> {
        return loadMcpConfigs().map((config) => {
            const server = this.servers.get(config.id);
            return {
                ...config,
                connected: !!server,
                toolCount: server?.tools.length ?? 0,
            };
        });
    }
}

export const mcpManager = new McpManager();
