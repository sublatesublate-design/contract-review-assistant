/**
 * platform/platformContext.ts
 * React Context，为 UI 组件提供平台适配器实例
 */

import { createContext, useContext } from 'react';
import type { IPlatformAdapter } from './types';

const PlatformContext = createContext<IPlatformAdapter | null>(null);

export const PlatformProvider = PlatformContext.Provider;

export function usePlatform(): IPlatformAdapter {
    const ctx = useContext(PlatformContext);
    if (!ctx) {
        throw new Error('usePlatform() 必须在 PlatformProvider 内部使用');
    }
    return ctx;
}
