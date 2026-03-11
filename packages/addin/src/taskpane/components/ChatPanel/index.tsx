import React, { useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, BookOpen, Loader2, Bot, User } from 'lucide-react';
import clsx from 'clsx';
import { useChatStore } from '../../../store/chatStore';
import { useReviewStore } from '../../../store/reviewStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { usePlatform } from '../../../platform/platformContext';
import { apiClient } from '../../../services/apiClient';

export default function ChatPanel() {
    const { session, isStreaming, addMessage, appendToLastMessage, setStreaming, finalizeLastMessage, clearSession, injectContractContext } =
        useChatStore();
    const { result } = useReviewStore();
    const { settings } = useSettingsStore();
    const platform = usePlatform();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // 自动滚动到底部
    useEffect(() => {
        const rafId = window.requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
        return () => window.cancelAnimationFrame(rafId);
    }, [session.messages]);

    /** 注入合同内容作为上下文 */
    const handleInjectContext = async () => {
        try {
            const content = await platform.documentReader.readFullText();
            const reviewSummary = result
                ? `\n\n当前审查已发现 ${result.issues.length} 个问题，摘要：${result.summary}`
                : '';
            addMessage(
                'system',
                `以下是用户正在审查的合同全文，请基于此内容回答用户的问题：\n\n${content}${reviewSummary}`
            );
            injectContractContext();
        } catch (err) {
            console.error('注入合同内容失败:', err);
        }
    };

    /** 发送消息 */
    const handleSend = useCallback(async () => {
        const text = (inputRef.current?.value ?? '').trim();
        if (!text || isStreaming) return;
        if (inputRef.current) inputRef.current.value = '';

        addMessage('user', text);
        addMessage('assistant', '');
        setStreaming(true);

        try {
            const history = session.messages
                .filter((m) => m.role !== 'system')
                .slice(-10)
                .map((m) => ({ role: m.role, content: m.content }));

            const systemMsg = session.messages.find((m) => m.role === 'system')?.content;
            await apiClient.chatStream(
                {
                    messages: [...history, { role: 'user', content: text }],
                    ...(systemMsg ? { systemPrompt: systemMsg } : {}),
                    provider: settings.provider,
                    model: settings.models[settings.provider],
                    apiKey: settings.provider === 'ollama'
                        ? undefined
                        : settings.apiKeys[settings.provider === 'claude' ? 'anthropic' : 'openai'],
                    // 仅 openai 兼容模式需要传 baseUrl（DeepSeek/本地代理等）
                    baseUrl: settings.provider === 'openai' ? settings.baseUrl : undefined,
                },
                settings.serverUrl,
                {
                    onDelta: (delta) => appendToLastMessage(delta),
                    onDone: () => finalizeLastMessage(),
                    onError: (err) => {
                        appendToLastMessage(`\n\n[错误：${err}]`);
                        finalizeLastMessage();
                    },
                }
            );
        } catch (err) {
            appendToLastMessage(`\n\n[发送失败：${err instanceof Error ? err.message : String(err)}]`);
            finalizeLastMessage();
        }
    }, [isStreaming, session.messages, settings]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    return (
        <div className="flex flex-col h-full">
            {/* 工具栏 */}
            <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-white flex gap-2">
                <button
                    onClick={handleInjectContext}
                    disabled={session.hasContractContext}
                    className={clsx(
                        'flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg border transition-colors',
                        session.hasContractContext
                            ? 'text-emerald-600 border-emerald-200 bg-emerald-50'
                            : 'text-gray-600 border-gray-200 bg-white hover:border-primary-300 hover:text-primary-600'
                    )}
                >
                    <BookOpen size={12} />
                    {session.hasContractContext ? '合同已注入 ✓' : '注入合同内容'}
                </button>
                <button
                    onClick={clearSession}
                    className="ml-auto btn-ghost text-xs flex items-center gap-1 text-gray-400"
                >
                    <Trash2 size={12} />
                    清空对话
                </button>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {session.messages.filter((m) => m.role !== 'system').length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                        <Bot size={32} className="mx-auto mb-3 opacity-40" />
                        <p className="text-sm">向 AI 咨询合同相关问题</p>
                        <p className="text-xs mt-1 text-gray-300">建议先点击「注入合同内容」以获得精准回答</p>
                    </div>
                )}

                {session.messages
                    .filter((m) => m.role !== 'system')
                    .map((msg) => (
                        <div
                            key={msg.id}
                            className={clsx(
                                'flex gap-2',
                                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                            )}
                        >
                            {/* 头像 */}
                            <div
                                className={clsx(
                                    'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white',
                                    msg.role === 'user' ? 'bg-primary-600' : 'bg-gray-600'
                                )}
                            >
                                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                            </div>

                            {/* 消息气泡 */}
                            <div
                                className={clsx(
                                    'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
                                    msg.role === 'user'
                                        ? 'bg-primary-600 text-white rounded-tr-sm'
                                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                                )}
                            >
                                {msg.content}
                                {msg.isStreaming && (
                                    <span className="inline-block w-1 h-3 ml-0.5 bg-gray-400 animate-pulse rounded-sm" />
                                )}
                            </div>
                        </div>
                    ))}
                <div ref={bottomRef} />
            </div>

            {/* 输入区 */}
            <div className="flex-shrink-0 p-3 border-t border-gray-200 bg-white">
                <div className="flex gap-2 items-end">
                    <textarea
                        ref={inputRef}
                        defaultValue=""
                        onKeyDown={handleKeyDown}
                        disabled={isStreaming}
                        placeholder="输入问题，Enter 发送，Shift+Enter 换行..."
                        className="flex-1 resize-none text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 max-h-24 min-h-[40px]"
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isStreaming}
                        className="btn-primary p-2 flex-shrink-0"
                    >
                        {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
