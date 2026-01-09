import { useEffect, useState } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { SubscriptionService } from '@/types';
import { Package, Loader2, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal';
import { EditEntityModal } from '@/components/modals/EditEntityModal';

interface ServicesTabProps {
    subscriptionId: string;
}

export function ServicesTab({ subscriptionId }: ServicesTabProps) {
    const [services, setServices] = useState<SubscriptionService[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal states
    const [editingService, setEditingService] = useState<SubscriptionService | null>(null);
    const [deletingService, setDeletingService] = useState<SubscriptionService | null>(null);
    const [cascadePreview, setCascadePreview] = useState<any>(null);
    const [deleteStep, setDeleteStep] = useState<'confirm' | 'deleting'>('confirm');

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
                        <th className="py-3 px-4 font-semibold text-slate-700">Service Name</th>
                        <th className="py-3 px-4 font-semibold text-slate-700 text-center">Quantity</th>
                        <th className="py-3 px-4 font-semibold text-slate-700 text-right">Unit Price</th>
                        <th className="py-3 px-4 font-semibold text-slate-700 text-center">Status</th>
                        <th className="py-3 px-4 font-semibold text-slate-700 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {services.map((service) => (
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
