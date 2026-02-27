/**
 * mcpConfig.ts
 * MCP 服务器配置的持久化管理
 * 配置存储在 %APPDATA%/ContractReviewAssistant/mcp-servers.json
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface McpServerConfig {
    id: string;
    name: string;
    transport: 'stdio' | 'sse';
    /** stdio 模式：要执行的命令 */
    command?: string | undefined;
    /** stdio 模式：命令参数 */
    args?: string[] | undefined;
    /** stdio 模式：环境变量 */
    env?: Record<string, string> | undefined;
    /** sse 模式：服务器 URL */
    url?: string | undefined;
    /** 是否启用 */
    enabled: boolean;
}

function getConfigPath(): string {
    const appData = process.env['APPDATA'] || path.join(os.homedir(), '.config');
    const dir = path.join(appData, 'ContractReviewAssistant');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'mcp-servers.json');
}

export function loadMcpConfigs(): McpServerConfig[] {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return [];
    }
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as McpServerConfig[];
    } catch {
        return [];
    }
}

export function saveMcpConfigs(configs: McpServerConfig[]): void {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(configs, null, 2), 'utf-8');
}
