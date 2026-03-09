import { useEffect } from 'react';

/**
 * Global paste shim for Mac Word/WPS taskpane webviews.
 *
 * Strategy:
 * 1) Only intercept shortcut paste (Ctrl/Cmd+V) to keep input focus in taskpane.
 * 2) Keep context-menu paste fully native (more stable in WPS webview).
 * 3) Use Clipboard API only as fallback if no native paste event arrives.
 */
export function usePasteShim() {
    useEffect(() => {
        let shortcutToken = 0;
        let shortcutHandledToken = 0;
        let shortcutTarget: HTMLElement | null = null;

        function isEditableTarget(el: Element | null): el is HTMLElement {
            if (!el) return false;
            if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
            if (el instanceof HTMLInputElement) {
                const editableTypes = ['text', 'password', 'search', 'url', 'email', 'tel', 'number'];
                return editableTypes.includes(el.type) && !el.disabled && !el.readOnly;
            }
            return el instanceof HTMLElement && el.isContentEditable;
        }

        function insertTextIntoInputLike(target: HTMLInputElement | HTMLTextAreaElement, text: string) {
            target.focus();
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? target.value.length;
            target.setRangeText(text, start, end, 'end');
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function insertTextIntoContentEditable(target: HTMLElement, text: string) {
            target.focus();
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                document.execCommand('insertText', false, text);
                return;
            }

            const range = selection.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function insertTextToElement(target: HTMLElement, text: string) {
            if (!text) return;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                insertTextIntoInputLike(target, text);
                return;
            }
            if (target.isContentEditable) {
                insertTextIntoContentEditable(target, text);
            }
        }

        async function fallbackReadClipboardAndInsert(token: number) {
            if (token !== shortcutToken || token === shortcutHandledToken) return;
            const active = shortcutTarget || (document.activeElement as HTMLElement | null);
            if (!isEditableTarget(active)) return;
            if (!navigator.clipboard?.readText) return;

            try {
                const text = await navigator.clipboard.readText();
                if (token !== shortcutToken || token === shortcutHandledToken) return;
                if (!text) return;
                insertTextToElement(active, text);
                shortcutHandledToken = token;
            } catch (err) {
                console.warn('[PasteShim] Clipboard API fallback failed:', err);
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            const key = (e.key || '').toLowerCase();
            const isPasteShortcut = (e.metaKey || e.ctrlKey) && (key === 'v' || e.keyCode === 86);
            if (!isPasteShortcut) return;

            const target = document.activeElement;
            if (!isEditableTarget(target)) return;

            // Stop host/editor from handling this shortcut outside the taskpane.
            e.preventDefault();
            e.stopPropagation();

            shortcutToken += 1;
            const token = shortcutToken;
            shortcutTarget = target;

            // If a native paste event does not arrive shortly, do manual fallback.
            window.setTimeout(() => {
                void fallbackReadClipboardAndInsert(token);
            }, 45);
        }

        function handlePaste(e: ClipboardEvent) {
            const active = document.activeElement as HTMLElement | null;
            if (!isEditableTarget(active)) return;

            // Context-menu paste path: keep native behavior untouched.
            if (shortcutToken === 0 || shortcutToken === shortcutHandledToken) return;

            // Shortcut paste path: consume once and insert plain text ourselves.
            e.preventDefault();
            e.stopPropagation();

            const text = e.clipboardData?.getData('text/plain') ?? '';
            if (!text) return;

            insertTextToElement(active, text);
            shortcutHandledToken = shortcutToken;
        }

        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('paste', handlePaste, true);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('paste', handlePaste, true);
        };
    }, []);
}
