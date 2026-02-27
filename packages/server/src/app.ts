import express from 'express';
import path from 'path';
import cors from 'cors';
import { reviewRouter } from './routes/review';
import { chatRouter } from './routes/chat';
import { modelsRouter } from './routes/models';
import { mcpRouter } from './routes/mcp';
import { mcpManager } from './services/mcp/mcpManager';

export function createApp(): import('express').Express {
    const app = express();
    const isDesktop = !!process.env['DESKTOP_MODE'];

    // ── 中间件 ──────────────────────────────────────────────
    app.use(
        cors({
            origin: [
                'https://localhost:3000', // Word Add-in 开发服务器
                'https://localhost',
                'null',                   // Word Desktop 加载 Add-in 时 origin 为 null
            ],
            credentials: true,
        })
    );
    app.use(express.json({ limit: '10mb' })); // 合同文档可能较长

    // ── 桌面模式：托管前端静态资源 ──────────────────────────
    if (isDesktop) {
        const publicDir = path.join(__dirname, 'public');
        app.use(express.static(publicDir));
    }

    // ── 路由 ────────────────────────────────────────────────
    app.use('/api/models', modelsRouter);
    app.use('/api/review', reviewRouter);
    app.use('/api/chat', chatRouter);
    app.use('/api/mcp', mcpRouter);

    // ── 初始化 MCP 客户端 ────────────────────────────────────
    mcpManager.initialize().catch((err) => {
        console.error('[MCP] 初始化失败:', err);
    });

    // ── 健康检查 ─────────────────────────────────────────────
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ── 统一错误处理 ─────────────────────────────────────────
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
