'use client';

import { useEffect, useState, useMemo } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { Subscription, LineItem } from '@/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Download, FileBarChart, Filter, Calendar as CalendarIcon, TrendingUp, Maximize2, Minimize2, X } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, AreaChart, Area, LineChart, Line, Legend } from 'recharts';
import Papa from 'papaparse';
import {
    addMonths, format, isWithinInterval, parseISO, startOfMonth,
    endOfMonth, eachMonthOfInterval, isSameMonth, startOfYear,
    endOfYear, startOfQuarter, endOfQuarter, subMonths, subQuarters, subYears
} from 'date-fns';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];

type GroupByOption = 'Category' | 'Owner' | 'Payment Method' | 'Billing Cycle' | 'Service';
type ViewMode = 'Accrual' | 'CashFlow';
type QuickFilter = 'Custom' | 'Last Year' | 'YTD' | 'Last Quarter' | 'Last Month' | 'Projected Current Year';
type ExpandedChart = 'Trend' | 'Breakdown' | null;

interface AggregatedData {
    name: string;
    count: number;
    cost: number;
    percentage: number;
}

interface TrendPoint {
    date: string;
    amount: number;
}

export default function ReportsPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);

    // Controls
    const [groupBy, setGroupBy] = useState<GroupByOption>('Category');
    const [viewMode, setViewMode] = useState<ViewMode>('CashFlow');
    const [filterStatus, setFilterStatus] = useState<string>('Active');

    // Time Window
    const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState<string>(format(addMonths(new Date(), 11), 'yyyy-MM-dd'));
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('Projected Current Year');

    // UI State
    const [expandedChart, setExpandedChart] = useState<ExpandedChart>(null);

    useEffect(() => {
        subscriptionService.getAll().then(data => {
            setSubscriptions(data);
            setLoading(false);
            // Initialize Quick Filter
            applyQuickFilter('Projected Current Year');
        });
    }, []);

    const applyQuickFilter = (filter: QuickFilter) => {
        setQuickFilter(filter);
        const now = new Date();
        let start = now;
        let end = now;

        switch (filter) {
            case 'Last Year':
                start = startOfYear(subYears(now, 1));
                end = endOfYear(subYears(now, 1));
                break;
            case 'YTD':
                start = startOfYear(now);
                end = endOfMonth(now);
                break;
            case 'Last Quarter':
                start = startOfQuarter(subQuarters(now, 1));
                end = endOfQuarter(subQuarters(now, 1));
                break;
            case 'Last Month':
                start = startOfMonth(subMonths(now, 1));
                end = endOfMonth(subMonths(now, 1));
                break;
            case 'Projected Current Year':
                start = startOfYear(now);
                end = endOfYear(now);
                break;
            case 'Custom':
                return; // Do not touch dates
        }

        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(format(end, 'yyyy-MM-dd'));
    };

    // Helper: Generate Month Range (Safe)
    const monthRange = useMemo(() => {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
        return eachMonthOfInterval({ start, end });
    }, [startDate, endDate]);

    // Trend Calc
    const trendData: TrendPoint[] = useMemo(() => {
        if (!subscriptions.length || !monthRange.length) return [];

        return monthRange.map(month => {
            let monthlyTotal = 0;
            subscriptions.forEach(sub => {
                if (filterStatus === 'Active' && sub.status !== 'Active') return;

                if (viewMode === 'CashFlow') {
                    if (sub.billingCycle === 'Monthly') monthlyTotal += sub.cost;
                    else if (sub.billingCycle === 'Annual') {
                        const renewal = parseISO(sub.renewalDate);
                        if (renewal.getMonth() === month.getMonth()) monthlyTotal += sub.cost;
                    }
                } else {
                    const monthlyCost = sub.billingCycle === 'Annual' ? sub.cost / 12 : sub.cost;
                    monthlyTotal += monthlyCost;
                }
            });
            return { date: format(month, 'MMM yy'), amount: monthlyTotal };
        });
    }, [subscriptions, monthRange, viewMode, filterStatus]);

    // Breakdown Calc
    const aggregatedData: AggregatedData[] = useMemo(() => {
        const map = new Map<string, number>();
        let totalPeriodCost = 0;

        const processItem = (key: string, cost: number, cycle: string, renewalDate: string) => {
            let itemPeriodCost = 0;
            monthRange.forEach(month => {
                if (viewMode === 'CashFlow') {
                    if (cycle === 'Monthly') itemPeriodCost += cost;
                    else {
                        const renewal = parseISO(renewalDate);
                        if (renewal.getMonth() === month.getMonth()) itemPeriodCost += cost;
                    }
                } else {
                    itemPeriodCost += (cycle === 'Annual' ? cost / 12 : cost);
                }
            });
            map.set(key, (map.get(key) || 0) + itemPeriodCost);
            totalPeriodCost += itemPeriodCost;
        };

        subscriptions.forEach(sub => {
            if (filterStatus === 'Active' && sub.status !== 'Active') return;

            if (groupBy === 'Service') {
                if (sub.lineItems && sub.lineItems.length > 0) {
                    sub.lineItems.forEach(item => {
                        processItem(`${sub.name} - ${item.name}`, item.cost, sub.billingCycle, sub.renewalDate);
                    });
                    const lineItemsTotal = sub.lineItems.reduce((sum, i) => sum + i.cost, 0);
                    if (lineItemsTotal < sub.cost) {
                        processItem(sub.name, sub.cost - lineItemsTotal, sub.billingCycle, sub.renewalDate);
                    }
                } else {
                    processItem(sub.name, sub.cost, sub.billingCycle, sub.renewalDate);
                }
            } else {
                let key = 'Unknown';
                if (groupBy === 'Category') key = sub.category;
                else if (groupBy === 'Owner') key = sub.owner.name;
                else if (groupBy === 'Payment Method') key = sub.paymentMethod;
                else if (groupBy === 'Billing Cycle') key = sub.billingCycle;
                processItem(key, sub.cost, sub.billingCycle, sub.renewalDate);
            }
        });

        return Array.from(map.entries())
            .map(([name, cost]) => ({
                name,
                count: 0,
                cost,
                percentage: totalPeriodCost ? (cost / totalPeriodCost) * 100 : 0
            }))
            .sort((a, b) => b.cost - a.cost);

    }, [subscriptions, monthRange, groupBy, viewMode, filterStatus]);

    const handleExport = () => {
        const csv = Papa.unparse(aggregatedData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `report_${groupBy}_${viewMode}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <DashboardLayout>Loading...</DashboardLayout>;

    const totalCost = aggregatedData.reduce((acc, curr) => acc + curr.cost, 0);

    // Expandable Chart Container
    const ChartContainer = ({ title, expandedId, children }: { title: string, expandedId: ExpandedChart, children: React.ReactNode }) => {
        const isExpanded = expandedChart === expandedId;
        return (
            <div className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 p-8 shadow-2xl' : 'p-6 h-full'}`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                    <button
                        onClick={() => setExpandedChart(isExpanded ? null : expandedId)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                        title={isExpanded ? "Minimize" : "Maximize"}
                    >
                        {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
                <div className="flex-1 w-full min-h-0">
                    {children}
                </div>
            </div>
        );
    };

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-100px)]">

                {/* Overlay Background for Expanded Mode */}
                {expandedChart && <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setExpandedChart(null)} />}

                {/* Header & Controls */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                            Advanced Analytics
                        </h1>
                        <p className="text-slate-500 text-xs mt-1">Project and analyze spend over time.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">

                        {/* Quick Filter */}
                        <select
                            value={quickFilter}
                            onChange={(e) => applyQuickFilter(e.target.value as QuickFilter)}
                            className="bg-slate-50 border-slate-200 text-slate-700 text-xs font-medium rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-1.5 pl-3 pr-8 w-44"
                        >
                            <option value="Last Year">Last Year</option>
                            <option value="YTD">YTD</option>
                            <option value="Last Quarter">Last Quarter</option>
                            <option value="Last Month">Last Month</option>
                            <option value="Projected Current Year">Projected Current Year</option>
                            <option value="Custom">Custom</option>
                        </select>

                        {/* Date Picker */}
                        <div className={`flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 ${quickFilter !== 'Custom' ? 'opacity-50 pointer-events-none' : ''}`}>
                            <CalendarIcon className="w-4 h-4 text-slate-400" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setQuickFilter('Custom'); }}
                                className="bg-transparent border-none p-0 text-xs font-medium focus:ring-0 text-slate-700 w-24"
                            />
                            <span className="text-slate-400">-</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setQuickFilter('Custom'); }}
                                className="bg-transparent border-none p-0 text-xs font-medium focus:ring-0 text-slate-700 w-24"
                            />
                        </div>

                        <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

                        {/* View Mode */}
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('CashFlow')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'CashFlow' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Cash Flow
                            </button>
                            <button
                                onClick={() => setViewMode('Accrual')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'Accrual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Accrual
                            </button>
                        </div>

                        {/* Group By */}
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
                            className="bg-slate-50 border-slate-200 text-slate-700 text-xs font-medium rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-1.5 pl-3 pr-8"
                        >
                            <option value="Category">Group: Category</option>
                            <option value="Owner">Group: Owner</option>
                            <option value="Service">Group: Service (Line Items)</option>
                            <option value="Payment Method">Group: Payment</option>
                        </select>

                        <button onClick={handleExport} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all">
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0 relative">

                    {/* Trend Chart */}
                    <div className="lg:col-span-3 h-[300px] shrink-0">
                        <ChartContainer title={`Spend Trend (${viewMode})`} expandedId="Trend">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(value) => `$${value}`} />
                                    <Tooltip
                                        formatter={(value: any) => [`$${value?.toLocaleString()}`, 'Cost']}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </div>

                    {/* Breakdown Chart */}
                    <div className="lg:col-span-1 h-full">
                        <ChartContainer title={`Total: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalCost)}`} expandedId="Breakdown">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={aggregatedData} layout="vertical" margin={{ left: 0 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                                    <Tooltip cursor={{ fill: 'transparent' }} formatter={(value: any) => [`$${value?.toLocaleString()}`, 'Cost']} />
                                    <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={20} fill="#8b5cf6">
                                        {aggregatedData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </div>

                    {/* Data Table */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
                        <div className="overflow-y-auto flex-1">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">{groupBy}</th>
                                        <th className="px-4 py-3 font-medium text-right">Cost ({viewMode})</th>
                                        <th className="px-4 py-3 font-medium text-right">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {aggregatedData.map((row, index) => (
                                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                {row.name}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-900 font-medium">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(row.cost)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-500">
                                                {row.percentage.toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
