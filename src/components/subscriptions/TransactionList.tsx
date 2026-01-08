'use client';

import { useState, useEffect } from 'react';
import { Transaction } from '@/types';
import { Plus, Download, ExternalLink } from 'lucide-react';

interface TransactionListProps {
    subscriptionId: string;
}

export function TransactionList({ subscriptionId }: TransactionListProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/transactions?subscriptionId=${subscriptionId}`)
            .then(res => res.json())
            .then(data => {
                setTransactions(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [subscriptionId]);

    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
    const averageCost = transactions.length > 0 ? totalSpent / transactions.length : 0;

    return (
        <div className="space-y-6">

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Total Spent (YTD)</div>
                    <div className="text-2xl font-bold text-slate-900">${totalSpent.toFixed(2)}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Average / Month</div>
                    <div className="text-2xl font-bold text-slate-900">${averageCost.toFixed(2)}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Last Payment</div>
                    <div className="text-2xl font-bold text-slate-900">
                        {transactions.length > 0 ? transactions[transactions.length - 1].date : '-'}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-900">Transaction History</h3>
                    <button className="text-sm flex items-center gap-1 text-purple-600 font-medium hover:text-purple-700">
                        <Plus className="w-4 h-4" />
                        Add Manual Entry
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading history...</div>
                ) : transactions.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No transactions recorded yet.</div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Description</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3 text-right">Invoice</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {transactions.map((tx) => (
                                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{tx.date}</td>
                                    <td className="px-6 py-4 text-slate-600">{tx.description}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                                            ${tx.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-slate-900">${tx.amount.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right">
                                        {tx.invoiceUrl && (
                                            <button className="text-slate-400 hover:text-purple-600 transition-colors">
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
