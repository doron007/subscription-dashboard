import type { Subscription } from '@/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { UtilizationBar } from './UtilizationBar';
import { MoreHorizontal, AlertCircle, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';

import { VendorLogo } from '@/components/common/VendorLogo';


interface SubscriptionTableProps {
    subscriptions: Subscription[];
    enableSearch?: boolean;
    limit?: number;
    title?: string;
}

export function SubscriptionTable({ subscriptions, enableSearch = false, limit, title = "Active Subscriptions" }: SubscriptionTableProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSubscriptions = useMemo(() => {
        let result = subscriptions;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(sub =>
                sub.name.toLowerCase().includes(lower) ||
                sub.category.toLowerCase().includes(lower) ||
                sub.owner.name.toLowerCase().includes(lower)
            );
        }

        return result;
    }, [subscriptions, searchTerm]);

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
                            <th className="px-6 py-3">Application</th>
                            <th className="px-6 py-3">Vendor</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Cost</th>
                            <th className="px-6 py-3">Renewal</th>
                            <th className="px-6 py-3">Utilization</th>
                            <th className="px-6 py-3">Owner</th>
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
