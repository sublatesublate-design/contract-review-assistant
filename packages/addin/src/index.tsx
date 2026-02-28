import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './taskpane/App';
import { waitForPlatform } from './platform/detect';
import { PlatformProvider } from './platform/platformContext';
import { createWordAdapter } from './platform/word/WordAdapter';
import { createWpsAdapter } from './platform/wps/WpsAdapter';
import type { IPlatformAdapter } from './platform/types';

/**
 * 统一入口：检测宿主平台（Word / WPS），初始化对应适配器后挂载 React
 */
async function bootstrap() {
    const platformType = await waitForPlatform();
    let adapter: IPlatformAdapter | null = null;

    if (platformType === 'word') {
        const wordAdapter = createWordAdapter();
        const isWord = await wordAdapter.initialize();
        if (isWord) adapter = wordAdapter;
    } else if (platformType === 'wps') {
        const wpsAdapter = createWpsAdapter();
        const ok = await wpsAdapter.initialize();
        if (ok) adapter = wpsAdapter;
    }

    const rootElement = document.getElementById('root');
    if (!rootElement) {
        throw new Error('Root element #root not found in taskpane.html');
    }
    const root = createRoot(rootElement);

    if (adapter) {
        if (adapter.platform === 'wps') {
            root.render(<h2>WPS React Render Test</h2>);
        } else {
            root.render(
                <React.StrictMode>
                    <PlatformProvider value={adapter}>
                        <App />
                    </PlatformProvider>
                </React.StrictMode>
            );
        }
    } else {
        // 非 Word/WPS 环境（开发调试用）
        root.render(
            <React.StrictMode>
                <div className="p-4 text-center text-gray-500">
                    <p className="text-lg font-medium">合同审查助手</p>
                    <p className="text-sm mt-2">请在 Microsoft Word 或 WPS Office 中使用本插件</p>
                </div>
            </React.StrictMode>
        );
    }
}

bootstrap().catch(err => {
    document.body.innerHTML = `
        <div style="color: red; padding: 20px; font-family: monospace;">
            <h3>Fatal Error in Bootstrap</h3>
            <pre>${err.message}</pre>
            <pre>${err.stack}</pre>
        </div>
    `;
});
