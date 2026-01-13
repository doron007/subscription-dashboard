import { useEffect, useState, useMemo, useCallback } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { SubscriptionService } from '@/types';
import { Package, Loader2, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal';
import { EditEntityModal } from '@/components/modals/EditEntityModal';

interface ServicesTabProps {
    subscriptionId: string;
}

type SortColumn = 'name' | 'quantity' | 'unitPrice' | 'status' | null;
type SortDirection = 'asc' | 'desc' | null;

export function ServicesTab({ subscriptionId }: ServicesTabProps) {
    const [services, setServices] = useState<SubscriptionService[]>([]);
    const [loading, setLoading] = useState(true);

    // Sorting state
    const [sortColumn, setSortColumn] = useState<SortColumn>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

    // Modal states
    const [editingService, setEditingService] = useState<SubscriptionService | null>(null);
    const [deletingService, setDeletingService] = useState<SubscriptionService | null>(null);
    const [cascadePreview, setCascadePreview] = useState<any>(null);
    const [deleteStep, setDeleteStep] = useState<'confirm' | 'deleting'>('confirm');

    // Cycle through sort states: none -> asc -> desc -> none
    const handleSort = useCallback((column: SortColumn) => {
        if (sortColumn !== column) {
            setSortColumn(column);
            setSortDirection('asc');
        } else if (sortDirection === 'asc') {
            setSortDirection('desc');
        } else if (sortDirection === 'desc') {
            setSortColumn(null);
            setSortDirection(null);
        } else {
            setSortDirection('asc');
        }
    }, [sortColumn, sortDirection]);

    // Sorted services
    const sortedServices = useMemo(() => {
        if (!sortColumn || !sortDirection) return services;

        return [...services].sort((a, b) => {
            let aVal: any;
            let bVal: any;

            switch (sortColumn) {
                case 'name':
                    aVal = (a.name || '').toLowerCase();
                    bVal = (b.name || '').toLowerCase();
                    break;
                case 'quantity':
                    aVal = a.currentQuantity || 0;
                    bVal = b.currentQuantity || 0;
                    break;
                case 'unitPrice':
                    aVal = a.currentUnitPrice || 0;
                    bVal = b.currentUnitPrice || 0;
                    break;
                case 'status':
                    aVal = a.status || '';
                    bVal = b.status || '';
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [services, sortColumn, sortDirection]);

    const loadServices = async () => {
        try {
            const data = await subscriptionService.getServices(subscriptionId);
            setServices(data);
        } catch (error) {
            console.error('Failed to load services:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadServices();
    }, [subscriptionId]);

    const handleSave = async (data: any) => {
        if (!editingService) return;
        await subscriptionService.updateService(editingService.id, data);
        await loadServices();
        setEditingService(null);
    };

    const handleDeleteClick = async (service: SubscriptionService) => {
        try {
            // Get cascade impact first
            const response = await subscriptionService.deleteService(service.id, false);
            if (response.requiresConfirmation) {
                setCascadePreview(response.impact);
                setDeletingService(service);
                setDeleteStep('confirm');
            } else {
                // If no cascade impact (unlikely for services due to line items, but possible), just double check or delete
                setDeletingService(service);
                setDeleteStep('confirm');
            }
        } catch (error) {
            console.error('Failed to prepare delete:', error);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingService) return;
        setDeleteStep('deleting');
        try {
            await subscriptionService.deleteService(deletingService.id, true);
            await loadServices();
        } catch (error) {
            console.error('Failed to delete service:', error);
        } finally {
            setDeletingService(null);
            setCascadePreview(null);
            setDeleteStep('confirm');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (services.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No services found</p>
                <p className="text-sm mt-1">Services will appear here when imported from invoices.</p>
            </div>
        );
    }

    const formatCurrency = (amount: number | undefined, currency = 'USD') => {
        if (amount === undefined) return '-';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-left">
                        <th
                            className="py-3 px-4 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('name')}
                        >
                            <div className="flex items-center gap-1">
                                Service Name
                                {sortColumn === 'name' && (
                                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                )}
                            </div>
                        </th>
                        <th
                            className="py-3 px-4 font-semibold text-slate-700 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('quantity')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                Quantity
                                {sortColumn === 'quantity' && (
                                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                )}
                            </div>
                        </th>
                        <th
                            className="py-3 px-4 font-semibold text-slate-700 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('unitPrice')}
                        >
                            <div className="flex items-center justify-end gap-1">
                                Unit Price
                                {sortColumn === 'unitPrice' && (
                                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                )}
                            </div>
                        </th>
                        <th
                            className="py-3 px-4 font-semibold text-slate-700 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('status')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                Status
                                {sortColumn === 'status' && (
                                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                )}
                            </div>
                        </th>
                        <th className="py-3 px-4 font-semibold text-slate-700 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedServices.map((service) => (
                        <tr key={service.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                            <td className="py-3 px-4">
                                <div className="font-medium text-slate-800">{service.name}</div>
                                {service.category && (
                                    <div className="text-xs text-slate-500 mt-0.5">{service.category}</div>
                                )}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-600">
                                {service.currentQuantity || '-'}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-600">
                                {formatCurrency(service.currentUnitPrice, service.currency)}
                            </td>
                            <td className="py-3 px-4 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${service.status === 'Active'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-slate-100 text-slate-600'
                                    }`}>
                                    {service.status}
                                </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => setEditingService(service)}
                                        className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-cyan-600 transition-colors"
                                        title="Edit Service"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteClick(service)}
                                        className="p-1 hover:bg-red-50 rounded text-slate-500 hover:text-red-500 transition-colors"
                                        title="Delete Service"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Summary */}
            <div className="mt-4 p-4 bg-slate-50 rounded-lg flex justify-between items-center text-sm">
                <span className="text-slate-600">{services.length} service(s)</span>
                <div className="text-right">
                    <span className="font-medium text-slate-800">
                        Estimated Monthly: {formatCurrency(
                            services.reduce((sum, s) => sum + ((s.currentQuantity || 0) * (s.currentUnitPrice || 0)), 0)
                        )}
                    </span>
                    <div className="text-xs text-slate-500 mt-0.5">Based on catalog unit pricing</div>
                </div>
            </div>

            {/* Modals */}
            <EditEntityModal
                isOpen={!!editingService}
                onClose={() => setEditingService(null)}
                onSave={handleSave}
                initialData={editingService}
                entityType="Service"
            />

            <ConfirmDeleteModal
                isOpen={!!deletingService}
                onClose={() => setDeletingService(null)}
                onConfirm={handleConfirmDelete}
                entityName={deletingService?.name || ''}
                entityType="Service"
                cascadeImpact={cascadePreview}
                isDeleting={deleteStep === 'deleting'}
            />
        </div>
    );
}
