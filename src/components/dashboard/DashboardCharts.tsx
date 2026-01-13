'use client';

import { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Subscription, Invoice } from '@/types';

interface LineItemWithBillingMonth {
    id: string;
    totalAmount: number;
    billingMonth: string; // yyyy-MM-dd format
    vendorName: string;
}

interface DashboardChartsProps {
    subscriptions: Subscription[];
    invoices?: Invoice[];
    lineItems?: LineItemWithBillingMonth[];
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];

export function DashboardCharts({ subscriptions, invoices = [], lineItems = [] }: DashboardChartsProps) {

    // 1. Calculate Monthly Spend Trend - show trailing 13 months for YoY comparison
    // Use line items with billingMonth when available for accurate period attribution
    const monthlyTrend = useMemo(() => {
        // Generate trailing 13 months (current + 12 prior = same month last year)
        const now = new Date();
        const trailing13Months: { date: Date; label: string }[] = [];
        for (let i = 12; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            trailing13Months.push({
                date: d,
                label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            });
        }

        // If we have line items with billing months, use them for accurate period attribution
        if (lineItems.length > 0) {
            return trailing13Months.map(({ date, label }) => {
                const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

                const monthlyTotal = lineItems.reduce((sum, item) => {
                    // billingMonth is in yyyy-MM-dd format, extract yyyy-MM
                    const itemMonth = item.billingMonth?.substring(0, 7);
                    if (itemMonth === monthStr) {
                        return sum + (item.totalAmount || 0);
                    }
                    return sum;
                }, 0);

                return {
                    name: label,
                    spend: monthlyTotal
                };
            });
        }

        // Fallback: If we have invoices but no line items, use invoice dates
        if (invoices.length > 0) {
            return trailing13Months.map(({ date, label }) => {
                const monthlyTotal = invoices.reduce((sum, inv) => {
                    const invDate = new Date(inv.invoiceDate);
                    // Match invoices from same month AND year
                    if (invDate.getMonth() === date.getMonth() &&
                        invDate.getFullYear() === date.getFullYear()) {
                        return sum + (inv.totalAmount || 0);
                    }
                    return sum;
                }, 0);

                return {
                    name: label,
                    spend: monthlyTotal
                };
            });
        }

        // Final fallback to subscription-based projection
        return trailing13Months.map(({ date, label }) => {
            const projectedCashFlow = subscriptions.reduce((sum, sub) => {
                if (sub.status !== 'Active') return sum;

                const renewalDate = new Date(sub.renewalDate);
                const renewalMonth = renewalDate.getMonth();

                if (sub.billingCycle === 'Monthly') {
                    return sum + sub.cost;
                } else {
                    return sum + (renewalMonth === date.getMonth() ? sub.cost : 0);
                }
            }, 0);

            return {
                name: label,
                spend: projectedCashFlow
            };
        });
    }, [subscriptions, invoices, lineItems]);

    // 2. Category/Vendor Breakdown - prefer line items with billing month
    const categoryData = useMemo(() => {
        const map = new Map<string, number>();

        // If we have line items, group by vendor using billing month data
        if (lineItems.length > 0) {
            lineItems.forEach(item => {
                const key = item.vendorName || 'Unknown Vendor';
                const current = map.get(key) || 0;
                map.set(key, current + (item.totalAmount || 0));
            });
        } else if (invoices.length > 0) {
            // Fallback to invoice data grouped by vendor
            invoices.forEach(inv => {
                const key = (inv as any).vendorName || 'Unknown Vendor';
                const current = map.get(key) || 0;
                map.set(key, current + (inv.totalAmount || 0));
            });
        } else {
            // Final fallback to subscription category breakdown
            subscriptions.forEach(sub => {
                if (sub.status !== 'Active') return;
                const annualCost = sub.billingCycle === 'Annual' ? sub.cost : sub.cost * 12;
                const current = map.get(sub.category) || 0;
                map.set(sub.category, current + annualCost);
            });
        }

        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [subscriptions, invoices, lineItems]);

    // Delay chart rendering until after layout is complete
    const [chartsReady, setChartsReady] = useState(false);
    useEffect(() => {
        // Double RAF ensures layout is fully computed
        const frame1 = requestAnimationFrame(() => {
            const frame2 = requestAnimationFrame(() => {
                setChartsReady(true);
            });
            return () => cancelAnimationFrame(frame2);
        });
        return () => cancelAnimationFrame(frame1);
    }, []);

    // Don't render if no data at all
    if (subscriptions.length === 0 && invoices.length === 0 && lineItems.length === 0) return null;

    const chartTitle = lineItems.length > 0
        ? 'Monthly Spend (Trailing 13 Months)'
        : invoices.length > 0
            ? 'Monthly Spend (Trailing 13 Months)'
            : `Projected Cash Flow (${new Date().getFullYear()})`;

    const categoryTitle = lineItems.length > 0 || invoices.length > 0
        ? 'Total Spend by Vendor'
        : 'Annual Spend by Category';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Monthly Spend Bar Chart - Trailing 13 Months */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-w-0">
                <h3 className="text-lg font-bold text-slate-900 mb-4">
                    {chartTitle}
                </h3>
                <div style={{ width: '100%', height: 300 }}>
                    {chartsReady && (
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                dy={10}
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                                height={50}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                                formatter={(value: number | undefined) => [`$${(value || 0).toLocaleString()}`, 'Spend']}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar
                                dataKey="spend"
                                fill="#8b5cf6"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Spend Distribution by Vendor/Category */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-w-0">
                <h3 className="text-lg font-bold text-slate-900 mb-4">
                    {categoryTitle}
                </h3>
                <div className="flex" style={{ width: '100%', height: 300, minHeight: 200 }}>
                    {/* Chart */}
                    <div className="flex-1" style={{ minWidth: 200, minHeight: 200 }}>
                        {chartsReady && (
                        <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
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
                        )}
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
