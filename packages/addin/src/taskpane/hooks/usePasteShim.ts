import { useEffect } from 'react';

/**
 * Global paste shim for Mac Word / WPS taskpane webviews.
 *
 * Goals:
 * 1) Keep paste inside the focused input/editor in the taskpane.
 * 2) Support remote-control keyboards (Ctrl+V sent to mac host).
 * 3) Avoid taskpane freeze from paste-time exceptions.
 */
export function usePasteShim() {
    useEffect(() => {
        let suppressNextPaste = false;

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
            target.dispatchEvent(new Event('change', { bubbles: true }));
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
            e.stopImmediatePropagation();

            suppressNextPaste = true;
            setTimeout(() => {
                suppressNextPaste = false;
            }, 80);

            if (!navigator.clipboard?.readText) return;

            try {
                const text = await navigator.clipboard.readText();
                const active = document.activeElement;
                if (!text || !isEditableTarget(active)) return;
                insertTextToElement(active, text);
            } catch (err) {
                console.warn('[PasteShim] Clipboard API readText failed:', err);
            }
        }

        function handlePaste(e: ClipboardEvent) {
            if (suppressNextPaste) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const target = document.activeElement;
            if (!isEditableTarget(target)) return;

            const text = e.clipboardData?.getData('text/plain');
            if (!text) return;

            e.preventDefault();
            e.stopPropagation();

            try {
                insertTextToElement(target, text);
            } catch (err) {
                console.error('[PasteShim] insert failed:', err);
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
