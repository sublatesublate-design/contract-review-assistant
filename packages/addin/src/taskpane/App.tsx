import React, { useState } from 'react';
import { FileText, Settings, MessageSquare } from 'lucide-react';
import ReviewPanel from './components/ReviewPanel';
import SettingsPanel from './components/SettingsPanel';
import ChatPanel from './components/ChatPanel';

type TabId = 'review' | 'settings' | 'chat';

interface Tab {
    id: TabId;
    label: string;
    icon: React.ReactNode;
}

const TABS: Tab[] = [
    { id: 'review', label: '审查结果', icon: <FileText size={15} /> },
    { id: 'settings', label: '设置', icon: <Settings size={15} /> },
    { id: 'chat', label: 'AI 对话', icon: <MessageSquare size={15} /> },
];

/**
 * 根组件：三 Tab 布局
 * - 审查结果：合同问题列表 + 定位/批注/修改操作
 * - 设置：AI 模型选择、API Key、审查深度配置
 * - AI 对话：基于合同内容的上下文对话
 */
export default function App() {
    const [activeTab, setActiveTab] = useState<TabId>('review');

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* 顶部标题栏 */}
            <header className="bg-white border-b border-gray-200 px-3 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary-600 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">审</span>
                    </div>
                    <h1 className="text-sm font-semibold text-gray-800">合同审查助手</h1>
                    <span className="ml-auto text-xs text-gray-400">v2.0</span>
                </div>
            </header>

            {/* Tab 导航 */}
            <nav className="bg-white border-b border-gray-200 flex-shrink-0">
                <div className="flex">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            id={`tab-${tab.id}`}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs
                         transition-colors duration-150 ${activeTab === tab.id ? 'tab-active' : 'tab-inactive'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </nav>

            {/* 内容区域 */}
            <main className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'review' && <ReviewPanel />}
                {activeTab === 'settings' && <SettingsPanel />}
                {activeTab === 'chat' && <ChatPanel />}
            </main>
        </div>
    );
}
