'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Subscription } from '@/types';

interface DashboardChartsProps {
    subscriptions: Subscription[];
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];

export function DashboardCharts({ subscriptions }: DashboardChartsProps) {

    // 1. Calculate Monthly Spend Trend (Simulated for this year based on active subs)
    const monthlyTrend = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        return months.map((month, index) => {
            // Logic: Include costs if sub is active. 
            // For Monthly: Include every month.
            // For Annual: Include only in the renewal month? Or amortize?
            // Dashboard usually shows "Cash Flow" (actual payments) or "Accrual" (monthly cost).
            // Let's show "Accrual" (Amortized Monthly cost) for a smoother graph, 
            // OR "Projected Spend" if we want to show spikes.
            // Let's go with AMORTIZED Monthly Value (MRR view) which is most useful for budgeting.

            const monthlyTotal = subscriptions.reduce((sum, sub) => {
                if (sub.status !== 'Active') return sum;
                return sum + (sub.cost / (sub.billingCycle === 'Annual' ? 12 : 1));
            }, 0);

            // Add some mock variation to make the chart look alive for demo purposes if static
            // But let's stick to real data: MRR is likely flat unless we have historical data.
            // Since we don't have historical data tables yet, we'll show the CURRENT snapshot projected flat.
            // TO make it interesting, let's pretend we have some growth or just show the decomposition?
            // Actually, let's show "Upcoming Renewals Cost" by month? That's useful.

            // Revised Logic: Projected ACTUAL Spend (Cash Flow)
            const projectedCashFlow = subscriptions.reduce((sum, sub) => {
                if (sub.status !== 'Active') return sum;

                const renewalDate = new Date(sub.renewalDate);
                const renewalMonth = renewalDate.getMonth(); // 0-11

                if (sub.billingCycle === 'Monthly') {
                    return sum + sub.cost; // Pays every month
                } else {
                    // Pays only in renewal month
                    return sum + (renewalMonth === index ? sub.cost : 0);
                }
            }, 0);

            return {
                name: month,
                spend: projectedCashFlow
            };
        });
    }, [subscriptions]);

    // 2. Category Breakdown
    const categoryData = useMemo(() => {
        const map = new Map<string, number>();
        subscriptions.forEach(sub => {
            if (sub.status !== 'Active') return;
            // Annualize cost for fair comparison
            const annualCost = sub.billingCycle === 'Annual' ? sub.cost : sub.cost * 12;
            const current = map.get(sub.category) || 0;
            map.set(sub.category, current + annualCost);
        });

        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [subscriptions]);

    if (subscriptions.length === 0) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Monthly Cash Flow Trend */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-w-0">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Projected Cash Flow ({new Date().getFullYear()})</h3>
                <div style={{ width: '100%', height: 300, minWidth: 0, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={monthlyTrend}>
                            <defs>
                                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                tickFormatter={(value) => `$${value}`}
                            />
                            <Tooltip
                                formatter={(value: number | undefined) => [`$${(value || 0).toLocaleString()}`, 'Spend']}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="spend"
                                stroke="#8b5cf6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorSpend)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Category Spend Distribution */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-w-0">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Annual Spend by Category</h3>
                <div className="flex" style={{ width: '100%', height: 300, minWidth: 0, minHeight: 0 }}>
                    {/* Chart */}
                    <div className="flex-1" style={{ minWidth: 200, minHeight: 200 }}>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number | undefined) => `$${(value || 0).toLocaleString()}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Legend */}
                    <div className="w-48 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                        <div className="space-y-3">
                            {categoryData.map((entry, index) => {
                                const total = categoryData.reduce((a, b) => a + b.value, 0);
                                const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(0) : '0';
                                return (
                                    <div key={index} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                            />
                                            <span className="text-slate-600 truncate max-w-[100px]" title={entry.name}>{entry.name}</span>
                                        </div>
                                        <span className="font-medium text-slate-900">
                                            {percentage}%
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
