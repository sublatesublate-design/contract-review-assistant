/**
 * platform/detect.ts
 * 运行时检测当前宿主环境：Word (Office.js) 或 WPS
 */

import type { PlatformType } from './types';

export function detectPlatform(): PlatformType {
    // WPS 会在 window 上注入 wps 全局对象
    if (typeof (window as any).wps !== 'undefined') {
        return 'wps';
    }
    // Office.js 从 CDN 脚本加载后注入 Office 全局对象
    if (typeof (window as any).Office !== 'undefined') {
        return 'word';
    }
    return 'unknown';
}

export async function waitForPlatform(timeoutMs = 3000): Promise<PlatformType> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const p = detectPlatform();
        if (p !== 'unknown') return p;
        await new Promise(r => setTimeout(r, 100));
    }
    return 'unknown';
}
