'use client';

import { useState } from 'react';
import { Plus, Trash2, Tag, DollarSign, Box } from 'lucide-react';
import type { LineItem } from '@/types';

interface LineItemsEditorProps {
    items: LineItem[];
    onChange: (items: LineItem[]) => void;
}

export function LineItemsEditor({ items, onChange }: LineItemsEditorProps) {
    const handleAdd = () => {
        const newItem: LineItem = {
            id: crypto.randomUUID(),
            name: '',
            cost: 0,
            type: ''
        };
        onChange([...items, newItem]);
    };

    const handleRemove = (id: string) => {
        onChange(items.filter(item => item.id !== id));
    };

    const handleUpdate = (id: string, field: keyof LineItem, value: any) => {
        onChange(items.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">Service Line Items</label>
                <button
                    type="button"
                    onClick={handleAdd}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Item
                </button>
            </div>

            {items.length === 0 && (
                <div className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
                    No line items added. Granular costs help with reporting.
                </div>
            )}

            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item.id} className="flex gap-3 items-start p-3 bg-slate-50 rounded-lg border border-slate-100 group">

                        {/* Name */}
                        <div className="flex-1">
                            <div className="relative">
                                <Box className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => handleUpdate(item.id, 'name', e.target.value)}
                                    placeholder="Service Name (e.g. EC2)"
                                    className="w-full pl-9 py-2 rounded-md border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        {/* Type */}
                        <div className="w-1/3">
                            <div className="relative">
                                <Tag className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={item.type || ''}
                                    onChange={(e) => handleUpdate(item.id, 'type', e.target.value)}
                                    placeholder="Type (e.g. Compute)"
                                    className="w-full pl-9 py-2 rounded-md border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        {/* Cost */}
                        <div className="w-28">
                            <div className="relative">
                                <DollarSign className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="number"
                                    value={item.cost}
                                    onChange={(e) => handleUpdate(item.id, 'cost', Number(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full pl-8 py-2 rounded-md border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => handleRemove(item.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {items.length > 0 && (
                <div className="text-right text-xs text-slate-500">
                    Total Line Items: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(items.reduce((sum, i) => sum + (i.cost || 0), 0))}
                </div>
            )}
        </div>
    );
}
