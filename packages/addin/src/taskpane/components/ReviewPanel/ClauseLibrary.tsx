import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search, Plus, Trash2, Edit2, Check, X, BookOpen, ChevronDown, ChevronRight, CornerDownLeft } from 'lucide-react';
import { useClauseStore } from '../../../store/clauseStore';
import type { ContractClause } from '../../../types/clause';

interface ClauseLibraryProps {
    onClose: () => void;
}

export default function ClauseLibrary({ onClose }: ClauseLibraryProps) {
    const { addClause, updateClause, deleteClause, getAllClauses } = useClauseStore();
    const clauses = getAllClauses();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Editor State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<ContractClause>>({});
    const [isCreating, setIsCreating] = useState(false);

    // Derived Data
    const categories = useMemo(() => {
        const cats = new Set(clauses.map(c => c.category));
        return ['all', ...Array.from(cats)];
    }, [clauses]);

    const filteredClauses = useMemo(() => {
        return clauses.filter(c => {
            const matchSearch = searchTerm === '' ||
                c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.content.toLowerCase().includes(searchTerm.toLowerCase());
            const matchCategory = selectedCategory === 'all' || c.category === selectedCategory;
            return matchSearch && matchCategory;
        });
    }, [clauses, searchTerm, selectedCategory]);

    // Actions
    const toggleExpand = (id: string) => {
        const next = new Set(expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedIds(next);
    };

    const handleInsert = async (content: string) => {
        try {
            await Word.run(async (context) => {
                const range = context.document.getSelection();
                range.insertText(content, Word.InsertLocation.replace);
                range.select(); // Re-select the inserted text or cursor
                await context.sync();
            });
        } catch (error) {
            console.error('Failed to insert clause:', error);
        }
    };

    const startEdit = (clause: ContractClause) => {
        setEditingId(clause.id);
        setEditForm(clause);
        setIsCreating(false);
    };

    const startCreate = () => {
        setEditingId('new');
        setEditForm({ category: '自定义条款', title: '', content: '' });
        setIsCreating(true);
    };

    const saveEdit = () => {
        if (!editForm.title?.trim() || !editForm.content?.trim() || !editForm.category?.trim()) return;

        if (isCreating) {
            addClause(editForm as Omit<ContractClause, 'id' | 'isBuiltin'>);
        } else if (editingId && editingId !== 'new') {
            updateClause(editingId, editForm);
        }

        setEditingId(null);
        setIsCreating(false);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setIsCreating(false);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 absolute inset-0 z-20 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-white border-b border-gray-200 shadow-sm shrink-0">
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2 font-semibold text-gray-800">
                    <BookOpen size={18} className="text-primary-600" />
                    标准条款库
                </div>
            </div>

            {/* Toolbar */}
            <div className="p-3 bg-white border-b border-gray-200 shrink-0 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder="搜索条款内容或标题..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-shadow"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${selectedCategory === cat
                                    ? 'bg-primary-100 text-primary-700 font-medium'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {cat === 'all' ? '全部' : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* List area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {isCreating && (
                    <div className="bg-white rounded-lg shadow-sm border border-primary-100 p-3 animate-in fade-in slide-in-from-top-2">
                        <div className="mb-3 font-medium text-sm text-gray-800 flex items-center gap-2">
                            <Plus size={16} className="text-primary-600" />
                            新增自定义条款
                        </div>
                        <div className="space-y-3 text-sm">
                            <input
                                placeholder="分类名称"
                                value={editForm.category}
                                onChange={e => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none"
                            />
                            <input
                                placeholder="条款标题"
                                value={editForm.title}
                                onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none"
                            />
                            <textarea
                                placeholder="条款正文内容"
                                rows={4}
                                value={editForm.content}
                                onChange={e => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none resize-none"
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                                <button onClick={cancelEdit} className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded">取消</button>
                                <button
                                    onClick={saveEdit}
                                    disabled={!editForm.title || !editForm.content || !editForm.category}
                                    className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                    <Check size={14} /> 保存
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {filteredClauses.length === 0 && !isCreating ? (
                    <div className="text-center py-8 text-sm text-gray-500">
                        未找到匹配的条款
                    </div>
                ) : (
                    filteredClauses.map(clause => {
                        const isExpanded = expandedIds.has(clause.id);
                        const isEditing = editingId === clause.id;

                        if (isEditing) {
                            return (
                                <div key={clause.id} className="bg-white rounded-lg shadow-sm border border-primary-100 p-3">
                                    <div className="space-y-3 text-sm">
                                        <input
                                            placeholder="分类名称"
                                            value={editForm.category}
                                            onChange={e => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded"
                                        />
                                        <input
                                            placeholder="条款标题"
                                            value={editForm.title}
                                            onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded"
                                        />
                                        <textarea
                                            rows={4}
                                            value={editForm.content}
                                            onChange={e => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded resize-none"
                                        />
                                        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                                            <button onClick={cancelEdit} className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded">取消</button>
                                            <button
                                                onClick={saveEdit}
                                                className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 flex items-center gap-1"
                                            >
                                                <Check size={14} /> 保存
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={clause.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all hover:border-primary-300 hover:shadow-md group">
                                <div
                                    className="px-3 py-2.5 flex items-center justify-between cursor-pointer select-none bg-gray-50/50"
                                    onClick={() => toggleExpand(clause.id)}
                                >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {isExpanded ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                                        <div className="truncate">
                                            <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded mr-2 inline-block">
                                                {clause.category}
                                            </span>
                                            <span className="text-sm font-medium text-gray-800" title={clause.title}>
                                                {clause.title}
                                            </span>
                                        </div>
                                    </div>
                                    {!clause.isBuiltin && (
                                        <span className="text-[10px] text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded ml-2 shrink-0 border border-primary-200">
                                            自定义
                                        </span>
                                    )}
                                </div>

                                {isExpanded && (
                                    <div className="p-3 border-t border-gray-100 bg-white">
                                        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-2.5 rounded border border-gray-100">
                                            {clause.content}
                                        </div>
                                        {clause.description && (
                                            <div className="mt-2 text-xs text-gray-500 italic">
                                                注：{clause.description}
                                            </div>
                                        )}

                                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-50">
                                            <div className="flex gap-1">
                                                {!clause.isBuiltin && (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); startEdit(clause); }}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                            title="编辑"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteClause(clause.id); }}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                            title="删除"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleInsert(clause.content)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded transition-colors"
                                            >
                                                <CornerDownLeft size={14} />
                                                插入文档
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* FAB to add custom clause */}
            {!isCreating && (
                <button
                    onClick={startCreate}
                    className="absolute bottom-6 right-6 p-3 bg-primary-600 text-white rounded-full shadow-lg shadow-primary-500/30 hover:bg-primary-700 hover:scale-105 transition-all"
                    title="添加自定义条款"
                >
                    <Plus size={20} />
                </button>
            )}
        </div>
    );
}
