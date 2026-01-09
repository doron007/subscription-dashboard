'use client';

import { useEffect, useState } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { Invoice, InvoiceLineItem } from '@/types';
import { FileText, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface InvoicesTabProps {
    subscriptionId: string;
}

export function InvoicesTab({ subscriptionId }: InvoicesTabProps) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
    const [lineItems, setLineItems] = useState<Record<string, InvoiceLineItem[]>>({});
    const [loadingLineItems, setLoadingLineItems] = useState<string | null>(null);

    useEffect(() => {
        async function loadInvoices() {
            try {
                const data = await subscriptionService.getInvoices(subscriptionId);
                setInvoices(data);
            } catch (error) {
                console.error('Failed to load invoices:', error);
            } finally {
                setLoading(false);
            }
        }
        loadInvoices();
    }, [subscriptionId]);

    const toggleInvoice = async (invoiceId: string) => {
        if (expandedInvoice === invoiceId) {
            setExpandedInvoice(null);
            return;
        }

        setExpandedInvoice(invoiceId);

        if (!lineItems[invoiceId]) {
            setLoadingLineItems(invoiceId);
            try {
                const items = await subscriptionService.getInvoiceLineItems(invoiceId);
                setLineItems(prev => ({ ...prev, [invoiceId]: items }));
            } catch (error) {
                console.error('Failed to load line items:', error);
            } finally {
                setLoadingLineItems(null);
            }
        }
    };

    const formatCurrency = (amount: number, currency = 'USD') => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    };

    const formatDate = (dateStr: string) => {
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

    if (invoices.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No invoices found</p>
                <p className="text-sm mt-1">Invoices will appear here when imported via Shadow IT Detector.</p>
            </div>
        );
    }

    const statusColors: Record<string, string> = {
        'Paid': 'bg-green-100 text-green-700',
        'Pending': 'bg-amber-100 text-amber-700',
        'Overdue': 'bg-red-100 text-red-700'
    };

    return (
        <div className="space-y-2">
            {invoices.map((invoice) => (
                <div key={invoice.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Invoice Header */}
                    <button
                        onClick={() => toggleInvoice(invoice.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-4">
                            {expandedInvoice === invoice.id ? (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                            <div>
                                <div className="font-medium text-slate-800">
                                    Invoice #{invoice.invoiceNumber || 'N/A'}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    {formatDate(invoice.invoiceDate)}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[invoice.status] || 'bg-slate-100 text-slate-600'}`}>
                                {invoice.status}
                            </span>
                            <span className="font-semibold text-slate-800">
                                {formatCurrency(invoice.totalAmount, invoice.currency)}
                            </span>
                        </div>
                    </button>

                    {/* Expanded Line Items */}
                    {expandedInvoice === invoice.id && (
                        <div className="border-t border-slate-200 bg-slate-50 p-4">
                            {loadingLineItems === invoice.id ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                </div>
                            ) : (lineItems[invoice.id]?.length || 0) > 0 ? (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-slate-500 text-xs uppercase">
                                            <th className="pb-2">Description</th>
                                            <th className="pb-2 text-center">Qty</th>
                                            <th className="pb-2 text-right">Unit Price</th>
                                            <th className="pb-2 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineItems[invoice.id].map((item) => (
                                            <tr key={item.id} className="border-t border-slate-200">
                                                <td className="py-2 text-slate-700">{item.description}</td>
                                                <td className="py-2 text-center text-slate-600">{item.quantity || '-'}</td>
                                                <td className="py-2 text-right text-slate-600">
                                                    {item.unitPrice ? formatCurrency(item.unitPrice) : '-'}
                                                </td>
                                                <td className="py-2 text-right font-medium text-slate-800">
                                                    {formatCurrency(item.totalAmount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-sm text-slate-500 text-center py-2">No line items</p>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {/* Summary */}
            <div className="mt-4 p-4 bg-slate-50 rounded-lg flex justify-between items-center text-sm">
                <span className="text-slate-600">{invoices.length} invoice(s)</span>
                <span className="font-medium text-slate-800">
                    Total: {formatCurrency(invoices.reduce((sum, inv) => sum + inv.totalAmount, 0))}
                </span>
            </div>
        </div>
    );
}
