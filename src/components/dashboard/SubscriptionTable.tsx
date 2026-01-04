import type { Subscription } from '../../types';
import { formatCurrency, formatDate, cn } from '../../lib/utils';
import { UtilizationBar } from './UtilizationBar';
import { MoreHorizontal, AlertCircle } from 'lucide-react';

interface SubscriptionTableProps {
    subscriptions: Subscription[];
}

export function SubscriptionTable({ subscriptions }: SubscriptionTableProps) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-clean overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Active Subscriptions</h3>
                <button className="text-sm text-slate-500 hover:text-slate-900 font-medium">View All</button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-3">Application</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Cost</th>
                            <th className="px-6 py-3">Renewal</th>
                            <th className="px-6 py-3">Utilization</th>
                            <th className="px-6 py-3">Owner</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {subscriptions.map((sub) => (
                            <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg border border-slate-200 p-1.5 bg-white flex items-center justify-center">
                                            <img src={sub.logo} alt={sub.name} className="w-full h-full object-contain" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900">{sub.name}</div>
                                            <div className="text-xs text-slate-500">{sub.category}</div>
                                        </div>
                                    </div>
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
                                    <div className="text-slate-700">{formatDate(sub.renewalDate)}</div>
                                    <div className="text-xs text-slate-400">{sub.paymentMethod}</div>
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
        </div>
    );
}
