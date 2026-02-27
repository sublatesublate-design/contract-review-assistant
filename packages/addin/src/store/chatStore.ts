import { create } from 'zustand';
import type { ChatMessage, ChatSession } from '../types/chat';

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface ChatState {
    session: ChatSession;
    isStreaming: boolean;
    // Actions
    addMessage: (role: ChatMessage['role'], content: string) => string;
    appendToLastMessage: (delta: string) => void;
    setStreaming: (isStreaming: boolean) => void;
    finalizeLastMessage: () => void;
    clearSession: () => void;
    injectContractContext: () => void;
}

const createEmptySession = (): ChatSession => ({
    id: generateId(),
    messages: [],
    createdAt: new Date().toISOString(),
    hasContractContext: false,
});

export const useChatStore = create<ChatState>()((set) => ({
    session: createEmptySession(),
    isStreaming: false,

    addMessage: (role, content) => {
        const id = generateId();
        const message: ChatMessage = {
            id,
            role,
            content,
            createdAt: new Date().toISOString(),
            isStreaming: role === 'assistant',
        };
        set((state) => ({
            session: {
                ...state.session,
                messages: [...state.session.messages, message],
            },
        }));
        return id;
    },

    appendToLastMessage: (delta) =>
        set((state) => {
            const msgs = state.session.messages;
            if (msgs.length === 0) return state;
            const last = msgs[msgs.length - 1];
            if (!last) return state;
            return {
                session: {
                    ...state.session,
                    messages: [
                        ...msgs.slice(0, -1),
                        { ...last, content: last.content + delta },
                    ],
                },
            };
        }),

    setStreaming: (isStreaming) => set({ isStreaming }),

    finalizeLastMessage: () =>
        set((state) => {
            const msgs = state.session.messages;
            if (msgs.length === 0) return state;
            const last = msgs[msgs.length - 1];
            if (!last) return state;
            return {
                isStreaming: false,
                session: {
                    ...state.session,
                    messages: [...msgs.slice(0, -1), { ...last, isStreaming: false }],
                },
            };
        }),

    clearSession: () => set({ session: createEmptySession(), isStreaming: false }),

    injectContractContext: () =>
        set((state) => ({
            session: { ...state.session, hasContractContext: true },
        })),
}));
