import { useEffect } from 'react';

/**
 * 全局粘贴修补 Hook
 *
 * 解决 Mac Word (WKWebView) 和 WPS (CEF) 中宿主应用拦截 Cmd+V/Ctrl+V 快捷键的问题。
 *
 * 原理：
 * 1. 在 document 捕获阶段监听 keydown，检测粘贴组合键
 * 2. 阻止宿主默认行为，通过 Clipboard API 主动读取剪贴板
 * 3. 使用 execCommand('insertText') 或直接操作 DOM 将文本插入到当前聚焦的输入框
 * 4. 同时拦截 paste 事件，用 insertText 替代默认粘贴行为以避免 React 受控组件的同步渲染阻塞
 */
export function usePasteShim() {
    useEffect(() => {
        /**
         * 判断当前聚焦元素是否为可编辑的文本输入区域
         */
        function isEditableTarget(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
            if (!el) return false;
            if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
            if (el instanceof HTMLInputElement) {
                const editableTypes = ['text', 'password', 'search', 'url', 'email', 'tel', 'number'];
                return editableTypes.includes(el.type) && !el.disabled && !el.readOnly;
            }
            // contenteditable
            if (el.getAttribute('contenteditable') === 'true') return true;
            return false;
        }

        /**
         * 向目标元素插入文本（保留浏览器 undo 栈）
         */
        function insertTextToElement(target: HTMLInputElement | HTMLTextAreaElement, text: string) {
            // 先聚焦目标
            target.focus();

            // 方案 A: execCommand('insertText') — 保留原生 undo 栈
            const success = document.execCommand('insertText', false, text);
            if (success) return;

            // 方案 B: 降级 — 直接操作 DOM value
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? target.value.length;
            const before = target.value.slice(0, start);
            const after = target.value.slice(end);
            target.value = before + text + after;
            const newCursor = start + text.length;
            target.setSelectionRange(newCursor, newCursor);

            // 手动触发 input 事件，确保任何监听器都能感知到变化
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        /**
         * keydown 捕获：拦截 Cmd+V / Ctrl+V
         */
        function handleKeyDown(e: KeyboardEvent) {
            // 检测 Cmd+V (Mac) 或 Ctrl+V (Win/Linux)
            const isPasteShortcut = (e.metaKey || e.ctrlKey) && e.key === 'v';
            if (!isPasteShortcut) return;

            const target = document.activeElement;
            if (!isEditableTarget(target)) return;

            // 阻止宿主拦截
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // 通过 Clipboard API 主动读取剪贴板
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(text => {
                    if (text && isEditableTarget(document.activeElement)) {
                        insertTextToElement(document.activeElement as HTMLInputElement | HTMLTextAreaElement, text);
                    }
                }).catch(err => {
                    console.warn('[PasteShim] Clipboard API readText failed:', err);
                    // Clipboard API 可能被安全策略阻止，此时无法降级
                    // 尝试用 execCommand 作为最后手段（大多数场景下也会失败）
                    document.execCommand('paste');
                });
            }
        }

        /**
         * paste 事件捕获：拦截右键粘贴，避免 React 受控组件阻塞
         */
        function handlePaste(e: ClipboardEvent) {
            const target = document.activeElement;
            if (!isEditableTarget(target)) return;

            const text = e.clipboardData?.getData('text/plain');
            if (!text) return;

            // 阻止默认粘贴行为（避免 React 受控组件的同步 setState 阻塞）
            e.preventDefault();
            e.stopPropagation();

            insertTextToElement(target as HTMLInputElement | HTMLTextAreaElement, text);
        }

        // 在捕获阶段注册，优先于所有其他事件处理器
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('paste', handlePaste, true);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('paste', handlePaste, true);
        };
    }, []);
}
