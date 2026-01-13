'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { Invoice, InvoiceLineItem } from '@/types';
import { FileText, Loader2, ChevronDown, ChevronRight, Calendar, CheckSquare, Square, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface InvoicesTabProps {
    subscriptionId: string;
}

interface LineItemWithPeriod extends InvoiceLineItem {
    billingMonth?: string;
    isManualOverride?: boolean;
}

interface GroupedLineItems {
    month: string;
    monthLabel: string;
    items: LineItemWithPeriod[];
    total: number;
}

/**
 * Extract billing month from description (same logic as periodParser)
 */
function extractBillingMonth(description: string, invoiceDate: string): string {
    if (!description) {
        return format(parseISO(invoiceDate), 'yyyy-MM-01');
    }

    const dateRangePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*\n?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const match = description.match(dateRangePattern);

    if (match) {
        const startMonth = parseInt(match[1]);
        const startYear = parseInt(match[3]);
        if (startMonth >= 1 && startMonth <= 12 && startYear >= 2000 && startYear <= 2100) {
            return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
        }
    }

    return format(parseISO(invoiceDate), 'yyyy-MM-01');
}

export function InvoicesTab({ subscriptionId }: InvoicesTabProps) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
    const [lineItems, setLineItems] = useState<Record<string, LineItemWithPeriod[]>>({});
    const [loadingLineItems, setLoadingLineItems] = useState<string | null>(null);

    // Selection state for period corrections
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [targetMonth, setTargetMonth] = useState('');
    const [isMoving, setIsMoving] = useState(false);

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
            setSelectedItems(new Set());
            return;
        }

        setExpandedInvoice(invoiceId);
        setSelectedItems(new Set());

        if (!lineItems[invoiceId]) {
            setLoadingLineItems(invoiceId);
            try {
                const items = await subscriptionService.getInvoiceLineItems(invoiceId);
                const invoice = invoices.find(inv => inv.id === invoiceId);
                const invoiceDate = invoice?.invoiceDate || new Date().toISOString();

                // Enrich items with billing month
                const enrichedItems: LineItemWithPeriod[] = items.map((item: any) => ({
                    ...item,
                    billingMonth: item.billingMonth || extractBillingMonth(item.description, invoiceDate),
                    isManualOverride: !!item.billingMonthOverride
                }));

                setLineItems(prev => ({ ...prev, [invoiceId]: enrichedItems }));
            } catch (error) {
                console.error('Failed to load line items:', error);
            } finally {
                setLoadingLineItems(null);
            }
        }
    };

    // Group line items by billing month
    const groupedByPeriod = useMemo((): GroupedLineItems[] => {
        if (!expandedInvoice || !lineItems[expandedInvoice]) return [];

        const groups = new Map<string, LineItemWithPeriod[]>();

        lineItems[expandedInvoice].forEach(item => {
            const month = item.billingMonth || '9999-12-01';
            if (!groups.has(month)) {
                groups.set(month, []);
            }
            groups.get(month)!.push(item);
        });

        return Array.from(groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, items]) => ({
                month,
                monthLabel: month === '9999-12-01' ? 'Unknown Period' : format(parseISO(month), 'MMMM yyyy'),
                items,
                total: items.reduce((sum, item) => sum + item.totalAmount, 0)
            }));
    }, [expandedInvoice, lineItems]);

    // Selection handlers
    const toggleItemSelection = (itemId: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
        } else {
            newSelected.add(itemId);
        }
        setSelectedItems(newSelected);
    };

    const toggleGroupSelection = (groupItems: LineItemWithPeriod[]) => {
        const allSelected = groupItems.every(item => selectedItems.has(item.id));
        const newSelected = new Set(selectedItems);

        if (allSelected) {
            groupItems.forEach(item => newSelected.delete(item.id));
        } else {
            groupItems.forEach(item => newSelected.add(item.id));
        }
        setSelectedItems(newSelected);
    };

    const selectAll = () => {
        if (!expandedInvoice || !lineItems[expandedInvoice]) return;
        const allIds = lineItems[expandedInvoice].map(item => item.id);
        setSelectedItems(new Set(allIds));
    };

    const clearSelection = () => {
        setSelectedItems(new Set());
    };

    // Move items to different period
    const handleMoveItems = async () => {
        if (selectedItems.size === 0 || !targetMonth) return;

        setIsMoving(true);
        try {
            // Move each selected item
            for (const itemId of selectedItems) {
                await fetch('/api/line-items/move-period', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        level: 'lineItem',
                        targetMonth,
                        filter: { lineItemId: itemId }
                    })
                });
            }

            // Refresh line items
            if (expandedInvoice) {
                const items = await subscriptionService.getInvoiceLineItems(expandedInvoice);
                const invoice = invoices.find(inv => inv.id === expandedInvoice);
                const invoiceDate = invoice?.invoiceDate || new Date().toISOString();

                const enrichedItems: LineItemWithPeriod[] = items.map((item: any) => ({
                    ...item,
                    billingMonth: item.billingMonth || extractBillingMonth(item.description, invoiceDate),
                    isManualOverride: !!item.billingMonthOverride
                }));

                setLineItems(prev => ({ ...prev, [expandedInvoice]: enrichedItems }));
            }

            setShowMoveModal(false);
            setSelectedItems(new Set());
            setTargetMonth('');
        } catch (error) {
            console.error('Failed to move items:', error);
        } finally {
            setIsMoving(false);
        }
    };

    // Generate month options
    const monthOptions = useMemo(() => {
        const options: { value: string; label: string }[] = [];
        const now = new Date();
        for (let i = -18; i <= 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            options.push({
                value: format(d, 'yyyy-MM-dd'),
                label: format(d, 'MMMM yyyy')
            });
        }
        return options;
    }, []);

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

    // Calculate selected total
    const selectedTotal = useMemo(() => {
        if (!expandedInvoice || !lineItems[expandedInvoice]) return 0;
        return lineItems[expandedInvoice]
            .filter(item => selectedItems.has(item.id))
            .reduce((sum, item) => sum + item.totalAmount, 0);
    }, [selectedItems, expandedInvoice, lineItems]);

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

                    {/* Expanded Line Items Grouped by Period */}
                    {expandedInvoice === invoice.id && (
                        <div className="border-t border-slate-200 bg-slate-50">
                            {loadingLineItems === invoice.id ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                </div>
                            ) : groupedByPeriod.length > 0 ? (
                                <>
                                    {/* Selection toolbar */}
                                    {selectedItems.size > 0 && (
                                        <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium text-indigo-900">
                                                    {selectedItems.size} item(s) selected
                                                </span>
                                                <span className="text-sm text-indigo-600">
                                                    {formatCurrency(selectedTotal)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={clearSelection}
                                                    className="text-xs text-indigo-600 hover:text-indigo-800"
                                                >
                                                    Clear
                                                </button>
                                                <button
                                                    onClick={() => setShowMoveModal(true)}
                                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                    Move to Period
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Grouped items */}
                                    <div className="divide-y divide-slate-200">
                                        {groupedByPeriod.map((group) => (
                                            <div key={group.month} className="p-4">
                                                {/* Period header */}
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => toggleGroupSelection(group.items)}
                                                            className="text-slate-400 hover:text-indigo-600"
                                                        >
                                                            {group.items.every(item => selectedItems.has(item.id)) ? (
                                                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                                                            ) : (
                                                                <Square className="w-4 h-4" />
                                                            )}
                                                        </button>
                                                        <Calendar className="w-4 h-4 text-slate-400" />
                                                        <span className="font-medium text-slate-700">{group.monthLabel}</span>
                                                        <span className="text-xs text-slate-500">({group.items.length} items)</span>
                                                    </div>
                                                    <span className="font-semibold text-slate-800">
                                                        {formatCurrency(group.total)}
                                                    </span>
                                                </div>

                                                {/* Line items table */}
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-left text-slate-500 text-xs uppercase">
                                                            <th className="pb-2 w-8"></th>
                                                            <th className="pb-2">Description</th>
                                                            <th className="pb-2 text-center">Qty</th>
                                                            <th className="pb-2 text-right">Unit Price</th>
                                                            <th className="pb-2 text-right">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {group.items.map((item) => (
                                                            <tr
                                                                key={item.id}
                                                                className={`border-t border-slate-100 cursor-pointer transition-colors ${
                                                                    selectedItems.has(item.id) ? 'bg-indigo-50' : 'hover:bg-white'
                                                                }`}
                                                                onClick={() => toggleItemSelection(item.id)}
                                                            >
                                                                <td className="py-2">
                                                                    {selectedItems.has(item.id) ? (
                                                                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                                                                    ) : (
                                                                        <Square className="w-4 h-4 text-slate-300" />
                                                                    )}
                                                                </td>
                                                                <td className="py-2 text-slate-700">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="truncate max-w-[400px]">{item.description}</span>
                                                                        {item.isManualOverride && (
                                                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                                adjusted
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
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
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-slate-500 text-center py-8">No line items</p>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {/* Move to Period Modal */}
            {showMoveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">
                            Move {selectedItems.size} Item(s) to Different Period
                        </h3>

                        <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                            <p className="text-sm text-slate-600">
                                Total amount: <span className="font-semibold text-slate-900">{formatCurrency(selectedTotal)}</span>
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                Select Target Month
                            </label>
                            <select
                                value={targetMonth}
                                onChange={(e) => setTargetMonth(e.target.value)}
                                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg p-2.5"
                            >
                                <option value="">Select a month...</option>
                                {monthOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowMoveModal(false);
                                    setTargetMonth('');
                                }}
                                disabled={isMoving}
                                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMoveItems}
                                disabled={!targetMonth || isMoving}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                            >
                                {isMoving ? 'Moving...' : 'Move Items'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
