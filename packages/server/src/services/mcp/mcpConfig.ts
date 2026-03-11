import fs from 'fs';
import path from 'path';
import os from 'os';

export interface McpServerConfig {
    id: string;
    name: string;
    transport: 'stdio';
    command?: string | undefined;
    args?: string[] | undefined;
    env?: Record<string, string> | undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeMcpConfig(value: unknown): McpServerConfig | null {
    if (!isRecord(value)) return null;

    const { id, name, transport, command, args, env, enabled } = value;
    if (typeof id !== 'string' || !id) return null;
    if (typeof name !== 'string' || !name) return null;
    if (transport !== 'stdio') return null;
    if (typeof command !== 'string' || !command) return null;
    if (typeof enabled !== 'boolean') return null;
    if (args !== undefined && (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string'))) {
        return null;
    }
    if (
        env !== undefined &&
        (!isRecord(env) || Object.values(env).some((entry) => typeof entry !== 'string'))
    ) {
        return null;
    }

    return {
        id,
        name,
        transport,
        command,
        ...(args ? { args: [...args] } : {}),
        ...(env ? { env: env as Record<string, string> } : {}),
        enabled,
    };
}

export function loadMcpConfigs(): McpServerConfig[] {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return [];
    }

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map(normalizeMcpConfig)
            .filter((config): config is McpServerConfig => config !== null);
    } catch {
        return [];
    }
}

export function saveMcpConfigs(configs: McpServerConfig[]): void {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(configs, null, 2), 'utf-8');
}
