import React, { useState, useEffect } from 'react';

type EntityType = 'Service' | 'Line Item';

interface EditEntityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    initialData: any;
    entityType: EntityType;
}

export function EditEntityModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    entityType
}: EditEntityModalProps) {
    const [formData, setFormData] = useState<any>(initialData || {});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Failed to save:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-2">
                    {initialData ? `Edit ${entityType}` : `Add ${entityType}`}
                </h3>

                <div className="mb-6">
                    {/* Discrepancy Warning */}
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                        <div className="flex gap-3">
                            <span className="text-xl">⚠️</span>
                            <div>
                                <p className="text-yellow-400 font-medium text-sm">Discrepancy Warning</p>
                                <p className="text-yellow-500/80 text-xs mt-1">
                                    Modifying this {entityType.toLowerCase()} will cause the calculated totals to differ from the original invoice.
                                </p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {entityType === 'Service' && (
                            <>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={formData.name || ''}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Quantity</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.currentQuantity || ''}
                                            onChange={(e) => setFormData({ ...formData, currentQuantity: parseFloat(e.target.value) })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Unit Price</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.currentUnitPrice || ''}
                                                onChange={(e) => setFormData({ ...formData, currentUnitPrice: parseFloat(e.target.value) })}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Category</label>
                                    <input
                                        type="text"
                                        value={formData.category || ''}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                    />
                                </div>
                            </>
                        )}

                        {entityType === 'Line Item' && (
                            <>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Description</label>
                                    <input
                                        type="text"
                                        value={formData.description || ''}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Qty</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.quantity || ''}
                                            onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Unit Price</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.unitPrice || ''}
                                            onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Total</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.totalAmount || ''}
                                            onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Start Date</label>
                                        <input
                                            type="date"
                                            value={formData.periodStart ? new Date(formData.periodStart).toISOString().split('T')[0] : ''}
                                            onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">End Date</label>
                                        <input
                                            type="date"
                                            value={formData.periodEnd ? new Date(formData.periodEnd).toISOString().split('T')[0] : ''}
                                            onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
