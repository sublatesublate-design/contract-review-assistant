import express from 'express';
import path from 'path';
import cors from 'cors';
import { reviewRouter } from './routes/review';
import { chatRouter } from './routes/chat';
import { modelsRouter } from './routes/models';
import { summaryRouter } from './routes/summary';
import { mcpRouter } from './routes/mcp';
import { mcpManager } from './services/mcp/mcpManager';

export function createApp(): import('express').Express {
    const app = express();
    const isDesktop = !!process.env['DESKTOP_MODE'];

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

    if (isDesktop) {
        const publicDir = path.join(__dirname, 'public');
        app.use(express.static(publicDir));
    }

    app.use('/api/models', modelsRouter);
    app.use('/api/review', reviewRouter);
    app.use('/api/chat', chatRouter);
    app.use('/api/summary', summaryRouter);
    app.use('/api/mcp', mcpRouter);

    mcpManager.initialize().catch((err) => {
        console.error('[MCP] initialization failed', err);
    });

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.use(
        (
            err: Error,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction
        ) => {
            console.error('[Error]', err.message);
            res.status(500).json({ error: err.message || 'Internal Server Error' });
        }
    );

    return app;
}
