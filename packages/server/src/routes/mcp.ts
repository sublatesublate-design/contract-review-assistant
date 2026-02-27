/**
 * MCP 管理 API 路由
 * - GET    /api/mcp/servers  列出已配置的 MCP 服务器
 * - POST   /api/mcp/servers  添加/更新 MCP 服务器
 * - DELETE /api/mcp/servers/:id  删除 MCP 服务器
 * - GET    /api/mcp/tools    列出所有可用工具
 * - POST   /api/mcp/servers/:id/reconnect  重新连接指定服务器
 */
import { Router } from 'express';
import { z } from 'zod';
import { mcpManager } from '../services/mcp/mcpManager';

export const mcpRouter: import('express').Router = Router();

const ServerConfigSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    transport: z.enum(['stdio', 'sse']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().optional(),
    enabled: z.boolean().default(true),
});

/**
 * GET /api/mcp/servers
 */
mcpRouter.get('/servers', (_req, res) => {
    const servers = mcpManager.getServersStatus();
    res.json(servers);
});

/**
 * POST /api/mcp/servers
 */
mcpRouter.post('/servers', async (req, res) => {
    const parseResult = ServerConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }

    try {
        await mcpManager.addServer(parseResult.data);
        res.json({ success: true, message: `MCP 服务器 "${parseResult.data.name}" 已添加` });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

/**
 * DELETE /api/mcp/servers/:id
 */
mcpRouter.delete('/servers/:id', async (req, res) => {
    try {
        await mcpManager.removeServer(req.params['id'] as string);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

/**
 * POST /api/mcp/servers/:id/reconnect
 */
mcpRouter.post('/servers/:id/reconnect', async (req, res) => {
    const servers = mcpManager.getServersStatus();
    const config = servers.find((s) => s.id === req.params['id']);
    if (!config) {
        res.status(404).json({ error: '未找到该服务器配置' });
        return;
    }

    try {
        await mcpManager.connectServer(config);
        res.json({ success: true, message: `已重新连接 "${config.name}"` });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

/**
 * GET /api/mcp/tools
 */
mcpRouter.get('/tools', (_req, res) => {
    const tools = mcpManager.listAllTools();
    res.json(tools);
});
