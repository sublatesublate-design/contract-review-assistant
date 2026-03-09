import { useEffect } from 'react';

/**
 * Global paste shim for Mac Word / WPS taskpane webviews.
 *
 * Goals:
 * 1) Keep paste inside the focused input/editor in the taskpane.
 * 2) Support remote-control keyboards (Ctrl+V sent to mac host).
 * 3) Keep context-menu paste on native path to reduce WPS freeze risk.
 */
export function usePasteShim() {
    useEffect(() => {
        let suppressNativePasteUntil = 0;
        let manualInsertInFlight = false;

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
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                insertTextIntoInputLike(target, text);
                return;
            }
            if (target.isContentEditable) {
                insertTextIntoContentEditable(target, text);
            }
        }

        async function handleKeyDown(e: KeyboardEvent) {
            const key = (e.key || '').toLowerCase();
            const isPasteShortcut = (e.metaKey || e.ctrlKey) && (key === 'v' || e.keyCode === 86);
            if (!isPasteShortcut) return;

            const target = document.activeElement;
            if (!isEditableTarget(target)) return;

            e.preventDefault();
            e.stopPropagation();

            // Some hosts will still emit a native paste event after keydown.
            // Swallow it briefly to avoid duplicate insertion / UI instability.
            suppressNativePasteUntil = Date.now() + 240;

            if (!navigator.clipboard?.readText) return;

            try {
                const text = await navigator.clipboard.readText();
                const active = document.activeElement;
                if (!text || !isEditableTarget(active)) return;
                manualInsertInFlight = true;
                insertTextToElement(active, text);
            } catch (err) {
                console.warn('[PasteShim] Clipboard API readText failed:', err);
            } finally {
                manualInsertInFlight = false;
            }
        }

        function handlePaste(e: ClipboardEvent) {
            const now = Date.now();
            if (now <= suppressNativePasteUntil) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const target = document.activeElement;
            if (!isEditableTarget(target)) return;

            // For context-menu paste in WPS/Word webview, prefer native path.
            // It is more stable than synthetic insertion in some hosts.
            if (manualInsertInFlight) {
                e.preventDefault();
                e.stopPropagation();
            }
        }

        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('paste', handlePaste, true);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('paste', handlePaste, true);
        };
    }, []);
}
