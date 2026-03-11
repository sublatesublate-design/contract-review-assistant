import { Router } from 'express';
import { z } from 'zod';
import { mcpManager } from '../services/mcp/mcpManager';

export const mcpRouter: import('express').Router = Router();

const ServerConfigSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    transport: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    enabled: z.boolean().default(true),
});

mcpRouter.get('/servers', (_req, res) => {
    res.json(mcpManager.getServersStatus());
});

mcpRouter.post('/servers', async (req, res) => {
    const parseResult = ServerConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.flatten() });
        return;
    }

    try {
        await mcpManager.addServer(parseResult.data);
        res.json({ success: true, message: `MCP server "${parseResult.data.name}" added` });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

mcpRouter.delete('/servers/:id', async (req, res) => {
    try {
        await mcpManager.removeServer(req.params['id'] as string);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

mcpRouter.post('/servers/:id/reconnect', async (req, res) => {
    const servers = mcpManager.getServersStatus();
    const config = servers.find((server) => server.id === req.params['id']);
    if (!config) {
        res.status(404).json({ error: 'Server config not found' });
        return;
    }

    try {
        await mcpManager.connectServer(config);
        res.json({ success: true, message: `Reconnected "${config.name}"` });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

mcpRouter.get('/tools', (_req, res) => {
    res.json(mcpManager.listAllTools());
});
