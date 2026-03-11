import cors from 'cors';
import express from 'express';
import path from 'path';
import { chatRouter } from './routes/chat';
import { mcpRouter } from './routes/mcp';
import { modelsRouter } from './routes/models';
import { reviewRouter } from './routes/review';
import { mcpManager } from './services/mcp/mcpManager';

type ProcessWithPkg = NodeJS.Process & { pkg?: unknown };

function isDesktopMode(): boolean {
    const processWithPkg = process as ProcessWithPkg;
    return Boolean(processWithPkg.pkg) || process.argv.includes('--desktop') || !!process.env['DESKTOP_MODE'];
}

export function createApp(): import('express').Express {
    const app = express();

    app.use(
        cors({
            origin: [
                'https://localhost:3000',
                'https://localhost',
                'null',
            ],
            credentials: true,
        })
    );
    app.use(express.json({ limit: '10mb' }));

    if (isDesktopMode()) {
        const publicDir = path.join(__dirname, 'public');
        app.use(express.static(publicDir));
    }

    app.use('/api/models', modelsRouter);
    app.use('/api/review', reviewRouter);
    app.use('/api/chat', chatRouter);
    app.use('/api/mcp', mcpRouter);

    mcpManager.initialize().catch((err) => {
        console.error('[MCP] initialization failed', err);
    });

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.use((
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
    ) => {
        console.error('[Error]', err.message);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    });

    return app;
}
