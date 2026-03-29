import { useEffect } from 'react';

/**
 * Global paste shim for Mac Word/WPS taskpane webviews.
 *
 * Strategy:
 * 1) For <input> and <textarea>: do NOT intercept — let native paste work.
 *    WPS CEF handles native paste into standard form elements just fine;
 *    intercepting it breaks paste because Clipboard API is unavailable in CEF.
 * 2) For contentEditable elements: intercept and manually insert plain text,
 *    because the host app (Word/WPS) may capture Cmd+V/Ctrl+V before the
 *    webview gets it.
 */
export function usePasteShim() {
    useEffect(() => {
        function isEditableTarget(el: Element | null): el is HTMLElement {
            if (!el) return false;
            if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
            if (el instanceof HTMLInputElement) {
                const editableTypes = ['text', 'password', 'search', 'url', 'email', 'tel', 'number'];
                return editableTypes.includes(el.type) && !el.disabled && !el.readOnly;
            }
            return el instanceof HTMLElement && el.isContentEditable;
        }

        function isNativeFormElement(el: Element | null): boolean {
            return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
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

        let shortcutToken = 0;
        let shortcutHandledToken = 0;

        function handleKeyDown(e: KeyboardEvent) {
            const key = (e.key || '').toLowerCase();
            const isPasteShortcut = (e.metaKey || e.ctrlKey) && (key === 'v' || e.keyCode === 86);
            if (!isPasteShortcut) return;

            const target = document.activeElement;
            if (!isEditableTarget(target)) return;

            // For input/textarea: do NOT intercept — let native Ctrl+V / Cmd+V work.
            if (isNativeFormElement(target)) return;

            // For contentEditable: intercept to prevent host from capturing the shortcut.
            e.preventDefault();
            e.stopPropagation();

            shortcutToken += 1;
            const token = shortcutToken;

            // If a native paste event does not arrive shortly, try Clipboard API fallback.
            window.setTimeout(() => {
                if (token !== shortcutToken || token === shortcutHandledToken) return;
                if (!navigator.clipboard?.readText) return;

                void navigator.clipboard.readText()
                    .then((text) => {
                        if (token !== shortcutToken || token === shortcutHandledToken) return;
                        if (!text) return;
                        insertTextIntoContentEditable(target, text);
                        shortcutHandledToken = token;
                    })
                    .catch((err) => {
                        console.warn('[PasteShim] Clipboard API fallback failed:', err);
                    });
            }, 45);
        }

        function handlePaste(e: ClipboardEvent) {
            const active = document.activeElement as HTMLElement | null;
            if (!isEditableTarget(active)) return;

            // For input/textarea: always let native paste through.
            if (isNativeFormElement(active)) return;

            // Context-menu paste path for contentEditable: keep native behavior.
            if (shortcutToken === 0 || shortcutToken === shortcutHandledToken) return;

            // Shortcut paste path for contentEditable: consume and insert plain text.
            e.preventDefault();
            e.stopPropagation();

            const text = e.clipboardData?.getData('text/plain') ?? '';
            if (!text) {
                shortcutHandledToken = shortcutToken;
                return;
            }

            insertTextIntoContentEditable(active, text);
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
