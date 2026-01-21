import type { Subscription } from '@/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { UtilizationBar } from './UtilizationBar';
import { MoreHorizontal, AlertCircle, Search, ArrowUp, ArrowDown, Eye, GitMerge, ChevronDown, Trash2, Download, Loader2 } from 'lucide-react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';

import { VendorLogo } from '@/components/common/VendorLogo';
import { VendorMergeModal } from '@/components/modals/VendorMergeModal';
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal';
import { subscriptionService } from '@/services/subscriptionService';

type SortColumn = 'name' | 'vendor' | 'status' | 'cost' | 'renewal' | 'utilization' | 'owner' | null;
type SortDirection = 'asc' | 'desc' | null;

interface SubscriptionTableProps {
    subscriptions: Subscription[];
    enableSearch?: boolean;
    limit?: number;
    title?: string;
    onRefresh?: () => void;
}

export function SubscriptionTable({ subscriptions, enableSearch = false, limit, title = "Active Subscriptions", onRefresh }: SubscriptionTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortColumn, setSortColumn] = useState<SortColumn>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Selection state for bulk actions
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkActionOpen, setBulkActionOpen] = useState(false);
    const bulkActionRef = useRef<HTMLDivElement>(null);

    // Bulk delete modal state
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
    const [bulkDeleteType, setBulkDeleteType] = useState<'subscription' | 'vendor'>('subscription');
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [bulkExporting, setBulkExporting] = useState(false);

    // Merge modal state
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [mergeSourceVendor, setMergeSourceVendor] = useState<{ id: string; name: string } | null>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdownId(null);
            }
            if (bulkActionRef.current && !bulkActionRef.current.contains(event.target as Node)) {
                setBulkActionOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Clear selection when subscriptions change
    useEffect(() => {
        setSelectedIds(new Set());
    }, [subscriptions]);

    const handleMergeClick = (vendorId: string, vendorName: string) => {
        setMergeSourceVendor({ id: vendorId, name: vendorName });
        setMergeModalOpen(true);
        setOpenDropdownId(null);
    };

    const handleMergeComplete = () => {
        if (onRefresh) {
            onRefresh();
        }
    };

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

    const filteredSubscriptions = useMemo(() => {
        let result = [...subscriptions];

        // Filter by search term
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(sub =>
                sub.name?.toLowerCase().includes(lower) ||
                sub.category?.toLowerCase().includes(lower) ||
                sub.owner?.name?.toLowerCase().includes(lower)
            );
        }

        // Sort if column and direction are set
        if (sortColumn && sortDirection) {
            result.sort((a, b) => {
                let aVal: any;
                let bVal: any;

                switch (sortColumn) {
                    case 'name':
                        aVal = (a.name || '').toLowerCase();
                        bVal = (b.name || '').toLowerCase();
                        break;
                    case 'vendor':
                        aVal = ((a as any).vendorName || '').toLowerCase();
                        bVal = ((b as any).vendorName || '').toLowerCase();
                        break;
                    case 'status':
                        aVal = a.status;
                        bVal = b.status;
                        break;
                    case 'cost':
                        aVal = a.cost || 0;
                        bVal = b.cost || 0;
                        break;
                    case 'renewal':
                        aVal = a.renewalDate ? new Date(a.renewalDate).getTime() : 0;
                        bVal = b.renewalDate ? new Date(b.renewalDate).getTime() : 0;
                        break;
                    case 'utilization':
                        aVal = a.seats?.total > 0 ? (a.seats?.used || 0) / a.seats.total : 0;
                        bVal = b.seats?.total > 0 ? (b.seats?.used || 0) / b.seats.total : 0;
                        break;
                    case 'owner':
                        aVal = (a.owner?.name || '').toLowerCase();
                        bVal = (b.owner?.name || '').toLowerCase();
                        break;
                    default:
                        return 0;
                }

                if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [subscriptions, searchTerm, sortColumn, sortDirection]);

    const displaySubscriptions = limit ? filteredSubscriptions.slice(0, limit) : filteredSubscriptions;

    // Selection handlers (must be after displaySubscriptions is defined)
    const toggleSelectAll = useCallback(() => {
        if (selectedIds.size === displaySubscriptions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(displaySubscriptions.map(s => s.id)));
        }
    }, [displaySubscriptions, selectedIds.size]);

    const toggleSelectOne = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const selectedSubscriptions = useMemo(() => {
        return displaySubscriptions.filter(s => selectedIds.has(s.id));
    }, [displaySubscriptions, selectedIds]);

    // Bulk delete handler
    const handleBulkDelete = async () => {
        setIsBulkDeleting(true);
        try {
            if (bulkDeleteType === 'vendor') {
                // Get unique vendor IDs from selected subscriptions
                const vendorIds = new Set(selectedSubscriptions.map(s => s.vendorId).filter(Boolean));
                for (const vendorId of vendorIds) {
                    await subscriptionService.deleteVendor(vendorId!, true);
                }
            } else {
                // Delete subscriptions one by one
                for (const sub of selectedSubscriptions) {
                    await subscriptionService.delete(sub.id);
                }
            }
            setSelectedIds(new Set());
            setBulkDeleteModalOpen(false);
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Bulk delete failed:', error);
            alert('Some items failed to delete. Please try again.');
        } finally {
            setIsBulkDeleting(false);
        }
    };

    // Export to CSV handler
    const handleExportCSV = async () => {
        setBulkExporting(true);
        setBulkActionOpen(false);
        try {
            // Fetch line items for all selected subscriptions
            const allLineItems: any[] = [];
            for (const sub of selectedSubscriptions) {
                try {
                    const lineItems = await subscriptionService.getLineItems(sub.id);
                    // Enrich each line item with subscription/vendor info
                    lineItems.forEach((li: any) => {
                        allLineItems.push({
                            subscription_name: sub.name,
                            vendor_name: (sub as any).vendorName || '',
                            category: sub.category || '',
                            service_name: li.serviceName || li.description || '',
                            description: li.description || '',
                            amount: li.total_amount || li.totalAmount || 0,
                            quantity: li.quantity || 1,
                            unit_price: li.unit_price || li.unitPrice || 0,
                            period_start: li.period_start || li.periodStart || '',
                            period_end: li.period_end || li.periodEnd || '',
                            billing_month: li.billing_month_override || li.billingMonthOverride || '',
                            invoice_date: li.invoiceDate || '',
                            invoice_number: li.invoiceNumber || '',
                            owner: sub.owner?.name || '',
                            owner_email: sub.owner?.email || '',
                            billing_cycle: sub.billingCycle || '',
                            status: sub.status || '',
                        });
                    });
                } catch (e) {
                    console.error(`Failed to fetch line items for ${sub.name}:`, e);
                }
            }

            if (allLineItems.length === 0) {
                alert('No line items found for the selected subscriptions.');
                return;
            }

            // Generate CSV
            const csv = Papa.unparse(allLineItems);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `subscription_line_items_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export data. Please try again.');
        } finally {
            setBulkExporting(false);
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-clean flex flex-col max-h-[calc(100vh-200px)]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-shrink-0 bg-white">
                <div className="flex items-center gap-4">
                    <h3 className="font-semibold text-slate-900 whitespace-nowrap">{title}</h3>

                    {/* Bulk Actions Dropdown - shown when items selected */}
                    {selectedIds.size > 0 && (
                        <div className="relative" ref={bulkActionRef}>
                            <button
                                onClick={() => setBulkActionOpen(!bulkActionOpen)}
                                disabled={bulkExporting}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                            >
                                {bulkExporting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <span>{selectedIds.size} selected</span>
                                        <ChevronDown className="w-4 h-4" />
                                    </>
                                )}
                            </button>

                            {bulkActionOpen && (
                                <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1">
                                    <button
                                        onClick={handleExportCSV}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export Line Items to CSV
                                    </button>
                                    <div className="border-t border-slate-100 my-1" />
                                    <button
                                        onClick={() => {
                                            setBulkDeleteType('subscription');
                                            setBulkDeleteModalOpen(true);
                                            setBulkActionOpen(false);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Subscriptions ({selectedIds.size})
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBulkDeleteType('vendor');
                                            setBulkDeleteModalOpen(true);
                                            setBulkActionOpen(false);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Vendors & All Data
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 flex-1 justify-end">
                    {enableSearch && (
                        <div className="relative w-full max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search subscriptions..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200 bg-slate-50 focus:bg-white transition-all"
                            />
                        </div>
                    )}

                    {!enableSearch && limit && (
                        <Link href="/subscriptions" className="text-sm text-slate-500 hover:text-slate-900 font-medium whitespace-nowrap">
                            View All
                        </Link>
                    )}
                </div>
            </div>

            <div className="overflow-auto flex-1">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-3 w-10">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === displaySubscriptions.length && displaySubscriptions.length > 0}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center gap-1">
                                    Application
                                    {sortColumn === 'name' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('vendor')}
                            >
                                <div className="flex items-center gap-1">
                                    Vendor
                                    {sortColumn === 'vendor' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center gap-1">
                                    Status
                                    {sortColumn === 'status' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('cost')}
                            >
                                <div className="flex items-center gap-1">
                                    Cost
                                    {sortColumn === 'cost' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('renewal')}
                            >
                                <div className="flex items-center gap-1">
                                    Renewal
                                    {sortColumn === 'renewal' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('utilization')}
                            >
                                <div className="flex items-center gap-1">
                                    Utilization
                                    {sortColumn === 'utilization' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('owner')}
                            >
                                <div className="flex items-center gap-1">
                                    Owner
                                    {sortColumn === 'owner' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {displaySubscriptions.map((sub) => (
                            <tr
                                key={sub.id}
                                className="hover:bg-slate-50/50 transition-colors group"
                            >
                                <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(sub.id)}
                                        onChange={() => toggleSelectOne(sub.id)}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/subscriptions/${sub.id}`} className="flex items-center gap-3">
                                        <VendorLogo name={sub.name} logo={sub.logo} />
                                        <div>
                                            <div className="font-medium text-slate-900">{sub.name}</div>
                                            <div className="text-xs text-slate-500">{sub.category}</div>
                                        </div>
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/subscriptions/${sub.id}`} className="block text-slate-600">{(sub as any).vendorName || '-'}</Link>
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/subscriptions/${sub.id}`} className="block">
                                        <span className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                            sub.status === 'Active' && "bg-slate-50 text-slate-700 border-slate-200",
                                            sub.status === 'Review' && "bg-amber-50 text-amber-900 border-amber-200",
                                            sub.status === 'Cancelled' && "bg-rose-50 text-rose-900 border-rose-200",
                                        )}>
                                            {sub.status === 'Active' && <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                                            {sub.status === 'Review' && <AlertCircle className="w-3 h-3" />}
                                            {sub.status}
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/subscriptions/${sub.id}`} className="block">
                                        <div className="font-medium text-slate-900">{formatCurrency(sub.cost)}</div>
                                        <div className="text-xs text-slate-400">{sub.billingCycle}</div>
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/subscriptions/${sub.id}`} className="block">
                                        {(() => {
                                            // Handle null/undefined/invalid dates
                                            if (!sub.renewalDate || sub.renewalDate === 'null' || sub.renewalDate === '') {
                                                return <div className="text-slate-400">—</div>;
                                            }
                                            const renewalDate = new Date(sub.renewalDate);
                                            // Check for invalid date (epoch = 1970, or 1969 in local timezone)
                                            if (isNaN(renewalDate.getTime()) || renewalDate.getFullYear() < 1980) {
                                                return <div className="text-slate-400">—</div>;
                                            }
                                            const isPastDue = renewalDate < new Date();
                                            return (
                                                <>
                                                    <div className={cn("text-slate-700", isPastDue && "text-red-600 font-medium")}>
                                                        {formatDate(sub.renewalDate)}
                                                        {isPastDue && <span className="ml-1 text-xs">(Past Due)</span>}
                                                    </div>
                                                    <div className="text-xs text-slate-400">{sub.paymentMethod}</div>
                                                </>
                                            );
                                        })()}
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/subscriptions/${sub.id}`} className="block">
                                        <UtilizationBar total={sub.seats.total} used={sub.seats.used} />
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/subscriptions/${sub.id}`} className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                            {sub.owner.name.split(' ').map(n => n[0]).join('')}
                                        </div>
                                        <span className="text-slate-600 truncate max-w-[100px]">{sub.owner.name}</span>
                                    </Link>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="relative" ref={openDropdownId === sub.id ? dropdownRef : undefined}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdownId(openDropdownId === sub.id ? null : sub.id);
                                            }}
                                            className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-100"
                                        >
                                            <MoreHorizontal className="w-5 h-5" />
                                        </button>

                                        {openDropdownId === sub.id && (
                                            <div className="absolute right-0 bottom-full mb-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                                                <Link
                                                    href={`/subscriptions/${sub.id}`}
                                                    onClick={() => setOpenDropdownId(null)}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    View Details
                                                </Link>
                                                <div className="border-t border-slate-100 my-1" />
                                                {sub.vendorId && (
                                                    <button
                                                        onClick={() => handleMergeClick(sub.vendorId!, (sub as any).vendorName || sub.name)}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                                                    >
                                                        <GitMerge className="w-4 h-4" />
                                                        Merge Vendor...
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Empty State */}
            {displaySubscriptions.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-sm">
                    No subscriptions found.
                </div>
            )}

            {/* Vendor Merge Modal */}
            <VendorMergeModal
                isOpen={mergeModalOpen}
                onClose={() => {
                    setMergeModalOpen(false);
                    setMergeSourceVendor(null);
                }}
                sourceVendor={mergeSourceVendor}
                onMergeComplete={handleMergeComplete}
            />

            {/* Bulk Delete Confirmation Modal */}
            <ConfirmDeleteModal
                isOpen={bulkDeleteModalOpen}
                onClose={() => setBulkDeleteModalOpen(false)}
                onConfirm={handleBulkDelete}
                entityName={
                    bulkDeleteType === 'vendor'
                        ? `${new Set(selectedSubscriptions.map(s => s.vendorId).filter(Boolean)).size} vendor(s)`
                        : `${selectedIds.size} subscription(s)`
                }
                entityType={bulkDeleteType === 'vendor' ? 'Vendor' : 'Subscription'}
                isDeleting={isBulkDeleting}
                cascadeImpact={
                    bulkDeleteType === 'vendor'
                        ? { subscriptions: selectedIds.size }
                        : undefined
                }
            />
        </div>
    );
}
