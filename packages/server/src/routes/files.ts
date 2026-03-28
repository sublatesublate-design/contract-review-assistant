import { Router } from 'express';
import { z } from 'zod';
import { saveTemporaryDocx } from '../services/files/tempDocStore';

export const filesRouter: import('express').Router = Router();

const SaveTempFileRequestSchema = z.object({
    base64: z.string().min(1, 'base64 \u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a'),
    fileName: z.string().optional(),
});

filesRouter.post('/save-temp', (req, res) => {
    const parsed = SaveTempFileRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    try {
        const result = saveTemporaryDocx(parsed.data.base64, parsed.data.fileName);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : '\u4fdd\u5b58\u4e34\u65f6\u6587\u6863\u5931\u8d25',
        });
    }
});
