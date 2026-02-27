import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ContractClause } from '../types/clause';
import { BUILTIN_CLAUSES } from '../constants/builtinClauses';

interface ClauseState {
    customClauses: ContractClause[];

    // Actions
    addClause: (clause: Omit<ContractClause, 'id' | 'isBuiltin'>) => void;
    updateClause: (id: string, clauseUpdate: Partial<ContractClause>) => void;
    deleteClause: (id: string) => void;

    // Selectors
    getAllClauses: () => ContractClause[];
}

export const useClauseStore = create<ClauseState>()(
    persist(
        (set, get) => ({
            customClauses: [],

            addClause: (clauseData) =>
                set((state) => ({
                    customClauses: [
                        ...state.customClauses,
                        {
                            ...clauseData,
                            id: `custom-${Date.now()}`,
                            isBuiltin: false,
                        },
                    ],
                })),

            updateClause: (id, clauseUpdate) =>
                set((state) => ({
                    customClauses: state.customClauses.map((c) =>
                        c.id === id ? { ...c, ...clauseUpdate } : c
                    ),
                })),

            deleteClause: (id) =>
                set((state) => ({
                    customClauses: state.customClauses.filter((c) => c.id !== id),
                })),

            getAllClauses: () => {
                const state = get();
                return [...BUILTIN_CLAUSES, ...state.customClauses];
            },
        }),
        {
            name: 'contract-review-clauses',
            partialize: (state) => ({ customClauses: state.customClauses }),
        }
    )
);
