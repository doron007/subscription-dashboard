import { useEffect, useState, useMemo } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { InvoiceLineItem } from '@/types';
import { ListChecks, Loader2, Search, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal';
import { EditEntityModal } from '@/components/modals/EditEntityModal';

interface LineItemsTabProps {
    subscriptionId: string;
}

interface ExtendedLineItem extends InvoiceLineItem {
    invoiceNumber?: string;
    invoiceDate?: string;
    serviceName?: string;
}

export function LineItemsTab({ subscriptionId }: LineItemsTabProps) {
    const [lineItems, setLineItems] = useState<ExtendedLineItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal states
    const [editingItem, setEditingItem] = useState<ExtendedLineItem | null>(null);
    const [deletingItem, setDeletingItem] = useState<ExtendedLineItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadLineItems = async () => {
        try {
            const data = await subscriptionService.getLineItems(subscriptionId);
            setLineItems(data);
        } catch (error) {
            console.error('Failed to load line items:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLineItems();
    }, [subscriptionId]);

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return lineItems;
        const query = searchQuery.toLowerCase();
        return lineItems.filter(item =>
            item.description?.toLowerCase().includes(query) ||
            item.serviceName?.toLowerCase().includes(query) ||
            item.invoiceNumber?.toLowerCase().includes(query)
        );
    }, [lineItems, searchQuery]);

    const handleSave = async (data: any) => {
        if (!editingItem) return;
        await subscriptionService.updateLineItem(editingItem.id, data);
        await loadLineItems();
        setEditingItem(null);
    };

    const handleConfirmDelete = async () => {
        if (!deletingItem) return;
        setIsDeleting(true);
        try {
            await subscriptionService.deleteLineItem(deletingItem.id);
            await loadLineItems();
        } catch (error) {
            console.error('Failed to delete line item:', error);
        } finally {
            setIsDeleting(false);
            setDeletingItem(null);
        }
    };

    const formatCurrency = (amount: number, currency = 'USD') => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        try {
            return format(new Date(dateStr), 'MMM d, yyyy');
        } catch {
            return dateStr;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (lineItems.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <ListChecks className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No line items found</p>
                <p className="text-sm mt-1">Line items will appear here when invoices are imported.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search line items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left">
                            <th className="py-3 px-4 font-semibold text-slate-700">Description</th>
                            <th className="py-3 px-4 font-semibold text-slate-700">Invoice</th>
                            <th className="py-3 px-4 font-semibold text-slate-700 text-center">Qty</th>
                            <th className="py-3 px-4 font-semibold text-slate-700 text-right">Unit Price</th>
                            <th className="py-3 px-4 font-semibold text-slate-700 text-right">Total</th>
                            <th className="py-3 px-4 font-semibold text-slate-700 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((item) => (
                            <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                                <td className="py-3 px-4">
                                    <div className="font-medium text-slate-800">{item.description}</div>
                                    {item.serviceName && (
                                        <div className="text-xs text-slate-500 mt-0.5">{item.serviceName}</div>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="text-slate-600">#{item.invoiceNumber || 'N/A'}</div>
                                    <div className="text-xs text-slate-400">{formatDate(item.invoiceDate)}</div>
                                </td>
                                <td className="py-3 px-4 text-center text-slate-600">
                                    {item.quantity || '-'}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600">
                                    {item.unitPrice ? formatCurrency(item.unitPrice) : '-'}
                                </td>
                                <td className="py-3 px-4 text-right font-medium text-slate-800">
                                    {formatCurrency(item.totalAmount)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setEditingItem(item)}
                                            className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-cyan-600 transition-colors"
                                            title="Edit Item"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setDeletingItem(item)}
                                            className="p-1 hover:bg-red-50 rounded text-slate-500 hover:text-red-500 transition-colors"
                                            title="Delete Item"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Summary */}
            <div className="p-4 bg-slate-50 rounded-lg flex justify-between items-center text-sm">
                <span className="text-slate-600">
                    {filteredItems.length} of {lineItems.length} line item(s)
                </span>
                <span className="font-medium text-slate-800">
                    Total: {formatCurrency(filteredItems.reduce((sum, item) => sum + item.totalAmount, 0))}
                </span>
            </div>

            {/* Modals */}
            <EditEntityModal
                isOpen={!!editingItem}
                onClose={() => setEditingItem(null)}
                onSave={handleSave}
                initialData={editingItem}
                entityType="Line Item"
            />

            <ConfirmDeleteModal
                isOpen={!!deletingItem}
                onClose={() => setDeletingItem(null)}
                onConfirm={handleConfirmDelete}
                entityName={deletingItem?.description || ''}
                entityType="Line Item"
                cascadeImpact={undefined} // Line items are leafs, no cascade
                isDeleting={isDeleting}
            />
        </div>
    );
}
