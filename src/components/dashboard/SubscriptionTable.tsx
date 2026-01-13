import type { Subscription } from '@/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { UtilizationBar } from './UtilizationBar';
import { MoreHorizontal, AlertCircle, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';

import { VendorLogo } from '@/components/common/VendorLogo';

type SortColumn = 'name' | 'vendor' | 'status' | 'cost' | 'renewal' | 'utilization' | 'owner' | null;
type SortDirection = 'asc' | 'desc' | null;

interface SubscriptionTableProps {
    subscriptions: Subscription[];
    enableSearch?: boolean;
    limit?: number;
    title?: string;
}

export function SubscriptionTable({ subscriptions, enableSearch = false, limit, title = "Active Subscriptions" }: SubscriptionTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortColumn, setSortColumn] = useState<SortColumn>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

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
                sub.name.toLowerCase().includes(lower) ||
                sub.category.toLowerCase().includes(lower) ||
                sub.owner.name.toLowerCase().includes(lower)
            );
        }

        // Sort if column and direction are set
        if (sortColumn && sortDirection) {
            result.sort((a, b) => {
                let aVal: any;
                let bVal: any;

                switch (sortColumn) {
                    case 'name':
                        aVal = a.name.toLowerCase();
                        bVal = b.name.toLowerCase();
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
                        aVal = a.seats.total > 0 ? a.seats.used / a.seats.total : 0;
                        bVal = b.seats.total > 0 ? b.seats.used / b.seats.total : 0;
                        break;
                    case 'owner':
                        aVal = a.owner.name.toLowerCase();
                        bVal = b.owner.name.toLowerCase();
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

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-clean overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                <h3 className="font-semibold text-slate-900 whitespace-nowrap">{title}</h3>

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

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                        <tr>
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
                                className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                                onClick={() => window.location.href = `/subscriptions/${sub.id}`}
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <VendorLogo name={sub.name} logo={sub.logo} />
                                        <div>
                                            <div className="font-medium text-slate-900">{sub.name}</div>
                                            <div className="text-xs text-slate-500">{sub.category}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-slate-600">{(sub as any).vendorName || '-'}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                        sub.status === 'Active' && "bg-slate-50 text-slate-700 border-slate-200",
                                        sub.status === 'Review' && "bg-amber-50 text-amber-900 border-amber-200", // Subtle warning color
                                        sub.status === 'Cancelled' && "bg-rose-50 text-rose-900 border-rose-200", // Subtle error color
                                    )}>
                                        {sub.status === 'Active' && <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                                        {sub.status === 'Review' && <AlertCircle className="w-3 h-3" />}
                                        {sub.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-slate-900">{formatCurrency(sub.cost)}</div>
                                    <div className="text-xs text-slate-400">{sub.billingCycle}</div>
                                </td>
                                <td className="px-6 py-4">
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
                                </td>
                                <td className="px-6 py-4">
                                    <UtilizationBar total={sub.seats.total} used={sub.seats.used} />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                            {sub.owner.name.split(' ').map(n => n[0]).join('')}
                                        </div>
                                        <span className="text-slate-600 truncate max-w-[100px]">{sub.owner.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
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
        </div>
    );
}
