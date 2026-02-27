import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './taskpane/App';

/* global Office */

/**
 * Office.onReady 是 Word Add-in 的入口点。
 * 必须等 Office JS 初始化完成后才能挂载 React。
 */
Office.onReady((info) => {
    if (info.host === Office.HostType.Word) {
        const rootElement = document.getElementById('root');
        if (!rootElement) {
            throw new Error('Root element #root not found in taskpane.html');
        }

        const root = createRoot(rootElement);
        root.render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
    } else {
        // 非 Word 环境（开发调试用）
        const rootElement = document.getElementById('root');
        if (rootElement) {
            const root = createRoot(rootElement);
            root.render(
                <React.StrictMode>
                    <div className="p-4 text-center text-gray-500">
                        <p className="text-lg font-medium">合同审查助手</p>
                        <p className="text-sm mt-2">请在 Microsoft Word 中使用本插件</p>
                    </div>
                </React.StrictMode>
            );
        }
    }
});
