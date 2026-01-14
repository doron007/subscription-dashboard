'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { subscriptionService } from '@/services/subscriptionService';
import type { Subscription, Invoice, Vendor } from '@/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Download, TrendingUp, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import Papa from 'papaparse';
import {
    format, parseISO, startOfYear, endOfYear, startOfQuarter, endOfQuarter,
    subMonths, subQuarters, subYears, isSameMonth, startOfMonth, endOfMonth
} from 'date-fns';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16', '#f97316', '#14b8a6'];

type GroupByOption = 'Vendor' | 'Service';
type QuickFilter = 'TTM' | 'Last Year' | 'YTD' | 'Last Quarter' | 'Last Month' | 'Current Month' | 'Custom';
type ExpandedChart = 'Trend' | 'Breakdown' | null;

interface AggregatedData {
    name: string;
    cost: number;
    percentage: number;
    color: string;
}

interface StackedTrendPoint {
    date: string;
    month: Date;
    total: number;
    [key: string]: any; // Dynamic keys for each category/vendor
}

interface LineItemWithInfo {
    id: string;
    invoiceId: string;
    subscriptionId?: string;
    description: string;
    totalAmount: number;
    invoiceDate: string;
    invoiceNumber?: string;
    vendorId?: string;
    vendorName: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    billingMonthOverride?: string | null;
    billingMonth: string; // Resolved billing month (yyyy-MM-dd format)
    isManualOverride?: boolean;
}

// Extract clean service name from description by stripping date suffixes
// This matches the logic used during import for consistency
function extractServiceName(description: string): string {
    if (!description) return 'Other';

    let cleaned = description.trim();

    // Remove date range suffix pattern: "M/D/YY-M/D/YY" or "MM/DD/YYYY-MM/DD/YYYY"
    // This handles patterns like "10/1/25-10/31/25" at the end
    cleaned = cleaned.replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}-\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '');

    // Remove standalone date patterns at end (single date like "10/1/25")
    cleaned = cleaned.replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '');

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned || 'Other';
}

export default function ReportsPage() {
    const router = useRouter();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [vendors, setVendors] = useState<(Vendor & { subscriptionCount: number; invoiceCount: number; totalSpend: number })[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [lineItems, setLineItems] = useState<LineItemWithInfo[]>([]);
    const [loading, setLoading] = useState(true);

    // Controls
    const [groupBy, setGroupBy] = useState<GroupByOption>('Vendor');
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('TTM');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // UI State
    const [expandedChart, setExpandedChart] = useState<ExpandedChart>(null);
    const [chartsReady, setChartsReady] = useState(false);

    // Generate TTM (Trailing Twelve Months) - 12 months ending last month (excludes current incomplete month)
    const getTTMMonths = useCallback(() => {
        const now = new Date();
        const months: Date[] = [];
        // Start from 12 months ago, end at last month (not current month)
        for (let i = 12; i >= 1; i--) {
            months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
        }
        return months;
    }, []);

    // Apply quick filter
    const applyQuickFilter = useCallback((filter: QuickFilter) => {
        setQuickFilter(filter);
        const now = new Date();

        switch (filter) {
            case 'TTM':
                // Don't set dates - we'll use getTTMMonths directly
                setStartDate('');
                setEndDate('');
                break;
            case 'Last Year':
                setStartDate(format(startOfYear(subYears(now, 1)), 'yyyy-MM-dd'));
                setEndDate(format(endOfYear(subYears(now, 1)), 'yyyy-MM-dd'));
                break;
            case 'YTD':
                setStartDate(format(startOfYear(now), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                break;
            case 'Last Quarter':
                setStartDate(format(startOfQuarter(subQuarters(now, 1)), 'yyyy-MM-dd'));
                setEndDate(format(endOfQuarter(subQuarters(now, 1)), 'yyyy-MM-dd'));
                break;
            case 'Last Month':
                setStartDate(format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                break;
            case 'Current Month':
                setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                break;
            case 'Custom':
                // Keep current dates
                break;
        }
    }, []);

    useEffect(() => {
        Promise.all([
            subscriptionService.getAll(),
            subscriptionService.getVendors().catch(() => []),
            subscriptionService.getInvoices().catch(() => []),
            subscriptionService.getAllLineItems().catch(() => [])
        ]).then(([subsData, vendorsData, invoicesData, lineItemsData]) => {
            setSubscriptions(subsData);
            setVendors(vendorsData);
            setInvoices(invoicesData);
            setLineItems(lineItemsData);
            setLoading(false);
        });
    }, []);

    // Delay chart rendering until after layout is complete
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

    // Navigate to subscription detail page with invoices tab
    const handleRowClick = useCallback((subscriptionId: string | undefined, vendorName: string) => {
        if (subscriptionId) {
            router.push(`/subscriptions/${subscriptionId}?tab=invoices`);
        } else {
            // If no subscription ID, navigate to subscriptions list filtered by vendor
            router.push(`/subscriptions?vendor=${encodeURIComponent(vendorName)}`);
        }
    }, [router]);

    // Get month range based on filter
    const monthRange = useMemo(() => {
        if (quickFilter === 'TTM') {
            return getTTMMonths();
        }
        if (!startDate || !endDate) return getTTMMonths();

        const start = parseISO(startDate);
        const end = parseISO(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
            return getTTMMonths();
        }

        const months: Date[] = [];
        let current = new Date(start.getFullYear(), start.getMonth(), 1);
        while (current <= end) {
            months.push(new Date(current));
            current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        }
        return months;
    }, [quickFilter, startDate, endDate, getTTMMonths]);

    // Get unique keys for stacking based on groupBy selection AND current month range
    const stackKeys = useMemo(() => {
        const keyTotals = new Map<string, number>();

        if (groupBy === 'Service' && lineItems.length > 0) {
            // Filter and group line items by service within the selected time range
            // Use billingMonth (resolved period) instead of invoiceDate
            lineItems.forEach(item => {
                if (!item.billingMonth) return;
                const itemBillingDate = parseISO(item.billingMonth);
                const inRange = monthRange.some(month => isSameMonth(itemBillingDate, month));
                if (inRange) {
                    const key = extractServiceName(item.description);
                    keyTotals.set(key, (keyTotals.get(key) || 0) + item.totalAmount);
                }
            });
        } else {
            // For vendor grouping, aggregate line items by vendor using their billing months
            lineItems.forEach(item => {
                if (!item.billingMonth) return;
                const itemBillingDate = parseISO(item.billingMonth);
                const inRange = monthRange.some(month => isSameMonth(itemBillingDate, month));
                if (inRange) {
                    const key = item.vendorName || 'Unknown';
                    keyTotals.set(key, (keyTotals.get(key) || 0) + item.totalAmount);
                }
            });
        }

        // Sort by total spend (highest first - these will be at bottom of stack)
        return Array.from(keyTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([key]) => key);
    }, [lineItems, groupBy, monthRange]);

    // Calculate stacked trend data
    const stackedTrendData: StackedTrendPoint[] = useMemo(() => {
        if (!monthRange.length) return [];

        return monthRange.map(month => {
            const point: StackedTrendPoint = {
                date: format(month, 'MMM yy'),
                month: month,
                total: 0
            };

            // Initialize all keys with 0
            stackKeys.forEach(key => {
                point[key] = 0;
            });

            // Always use line items with resolved billingMonth for accurate period allocation
            lineItems.forEach(item => {
                if (!item.billingMonth) return;
                const itemBillingDate = parseISO(item.billingMonth);
                if (isSameMonth(itemBillingDate, month)) {
                    const key = groupBy === 'Service'
                        ? extractServiceName(item.description)
                        : (item.vendorName || 'Unknown');
                    point[key] = (point[key] || 0) + item.totalAmount;
                    point.total += item.totalAmount;
                }
            });

            return point;
        });
    }, [monthRange, lineItems, stackKeys, groupBy]);

    // Aggregated breakdown data
    const aggregatedData: AggregatedData[] = useMemo(() => {
        const map = new Map<string, number>();
        let totalPeriodCost = 0;

        // Always use line items with resolved billingMonth for accurate period allocation
        lineItems.forEach(item => {
            if (!item.billingMonth) return;
            const itemBillingDate = parseISO(item.billingMonth);
            const inRange = monthRange.some(month => isSameMonth(itemBillingDate, month));
            if (inRange) {
                const key = groupBy === 'Service'
                    ? extractServiceName(item.description)
                    : (item.vendorName || 'Unknown Vendor');
                map.set(key, (map.get(key) || 0) + item.totalAmount);
                totalPeriodCost += item.totalAmount;
            }
        });

        return Array.from(map.entries())
            .map(([name, cost], index) => ({
                name,
                cost,
                percentage: totalPeriodCost ? (cost / totalPeriodCost) * 100 : 0,
                color: COLORS[index % COLORS.length]
            }))
            .sort((a, b) => b.cost - a.cost);
    }, [lineItems, monthRange, groupBy]);

    // Color map for consistent colors
    const colorMap = useMemo(() => {
        const map: Record<string, string> = {};
        aggregatedData.forEach((item, index) => {
            map[item.name] = COLORS[index % COLORS.length];
        });
        return map;
    }, [aggregatedData]);

    // stackKeys already sorted with largest first - this means largest renders at bottom of stack

    const handleExport = async () => {
        // Generate detailed CSV with monthly breakdown by vendor/service
        const rows: any[] = [];
        const totalCostForExport = aggregatedData.reduce((sum, d) => sum + d.cost, 0);

        // Metadata header
        const periodLabel = quickFilter === 'TTM'
            ? 'Trailing 12 Months'
            : quickFilter === 'Custom'
                ? `${startDate} to ${endDate}`
                : quickFilter;
        rows.push({ 'Month': `Report: ${groupBy} Spend`, [groupBy]: `Period: ${periodLabel}`, 'Amount': `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}` });
        rows.push({}); // Empty row

        // Detailed monthly data with ISO date format
        stackedTrendData.forEach(monthData => {
            const monthDate = format(monthData.month, 'yyyy-MM'); // ISO format for sorting/analysis
            stackKeys.forEach(key => {
                const amount = monthData[key] || 0;
                if (amount > 0) {
                    rows.push({
                        'Month': monthDate,
                        [groupBy]: key,
                        'Amount': Math.round(amount * 100) / 100 // Clean number, 2 decimal places
                    });
                }
            });
            // Add monthly total row
            if (monthData.total > 0) {
                rows.push({
                    'Month': monthDate,
                    [groupBy]: '** Monthly Total **',
                    'Amount': Math.round(monthData.total * 100) / 100
                });
            }
        });

        // Summary section
        rows.push({});
        rows.push({ 'Month': '=== SUMMARY BY ' + groupBy.toUpperCase() + ' ===' });
        rows.push({ 'Month': groupBy, [groupBy]: 'Total Amount', 'Amount': 'Percentage' }); // Header
        aggregatedData.forEach(d => {
            rows.push({
                'Month': d.name,
                [groupBy]: Math.round(d.cost * 100) / 100,
                'Amount': `${d.percentage.toFixed(1)}%`
            });
        });
        rows.push({
            'Month': 'GRAND TOTAL',
            [groupBy]: Math.round(totalCostForExport * 100) / 100,
            'Amount': '100%'
        });

        const csv = Papa.unparse(rows);

        // Sanitize filename
        const safeGroupBy = groupBy.toLowerCase();
        const safeFilter = quickFilter.replace(/\s+/g, '_').toLowerCase();
        const timestamp = format(new Date(), 'yyyyMMdd');
        const filename = `report_${safeGroupBy}_${safeFilter}_${timestamp}.csv`;

        // Try File System Access API first (bypasses download manager extensions)
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'CSV Files',
                        accept: { 'text/csv': ['.csv'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(csv);
                await writable.close();
                return;
            } catch (err: any) {
                // User cancelled or API failed - fall through to fallback
                if (err.name === 'AbortError') return;
                console.warn('File System Access API failed, using fallback:', err);
            }
        }

        // Fallback: traditional download via server endpoint
        const encodedData = btoa(unescape(encodeURIComponent(csv)));
        const url = `/api/export/csv?data=${encodeURIComponent(encodedData)}&filename=${encodeURIComponent(filename)}`;

        let iframe = document.getElementById('download-iframe') as HTMLIFrameElement;
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'download-iframe';
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
        }
        iframe.src = url;
    };

    // Custom tooltip for stacked chart
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;

        const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);

        return (
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-3 min-w-[200px]">
                <p className="font-semibold text-slate-900 mb-2 border-b border-slate-100 pb-2">{label}</p>
                <div className="space-y-1.5">
                    {payload
                        .filter((entry: any) => entry.value > 0)
                        .sort((a: any, b: any) => b.value - a.value)
                        .map((entry: any, index: number) => (
                            <div key={index} className="flex items-center justify-between gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                    <span className="text-slate-600 truncate max-w-[120px]">{entry.dataKey}</span>
                                </div>
                                <span className="font-medium text-slate-900">
                                    ${entry.value?.toLocaleString()}
                                </span>
                            </div>
                        ))}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between">
                    <span className="font-semibold text-slate-700">Total</span>
                    <span className="font-bold text-slate-900">${total.toLocaleString()}</span>
                </div>
            </div>
        );
    };

    if (loading) return <DashboardLayout><div className="flex items-center justify-center h-64 text-slate-400">Loading...</div></DashboardLayout>;

    const totalCost = aggregatedData.reduce((acc, curr) => acc + curr.cost, 0);

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-7xl mx-auto">

                {/* Overlay Background for Expanded Mode */}
                {expandedChart && <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setExpandedChart(null)} />}

                {/* Header & Controls */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                            Advanced Analytics
                        </h1>
                        <p className="text-slate-500 text-xs mt-1">Analyze spend trends by vendor over time.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Quick Filter */}
                        <select
                            value={quickFilter}
                            onChange={(e) => applyQuickFilter(e.target.value as QuickFilter)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 pl-3 pr-8"
                        >
                            <option value="TTM">TTM (Trailing 12 Months)</option>
                            <option value="Last Year">Last Year</option>
                            <option value="YTD">YTD</option>
                            <option value="Last Quarter">Last Quarter</option>
                            <option value="Last Month">Last Month</option>
                            <option value="Current Month">Current Month</option>
                            <option value="Custom">Custom Range</option>
                        </select>

                        {/* Custom Date Picker - only show when Custom is selected */}
                        {quickFilter === 'Custom' && (
                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-transparent border-none p-0 text-xs font-medium focus:ring-0 text-slate-700 w-28"
                                />
                                <span className="text-slate-400">→</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-transparent border-none p-0 text-xs font-medium focus:ring-0 text-slate-700 w-28"
                                />
                            </div>
                        )}

                        <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

                        {/* Group By */}
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 pl-3 pr-8"
                        >
                            <option value="Vendor">Group: Vendor</option>
                            <option value="Service">Group: Service</option>
                        </select>

                        <button
                            onClick={handleExport}
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg border border-slate-200 transition-all"
                            title="Export CSV"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Stacked Trend Chart */}
                <div className={`bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 ${expandedChart === 'Trend' ? 'fixed inset-4 z-50 p-6' : 'p-6'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Monthly Spend by {groupBy}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {quickFilter === 'TTM' ? 'Trailing 12 months (excl. current month)' : `${format(monthRange[0] || new Date(), 'MMM yyyy')} - ${format(monthRange[monthRange.length - 1] || new Date(), 'MMM yyyy')}`}
                                {' • '}Total: <span className="font-semibold text-slate-700">${totalCost.toLocaleString()}</span>
                            </p>
                        </div>
                        <button
                            onClick={() => setExpandedChart(expandedChart === 'Trend' ? null : 'Trend')}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                            title={expandedChart === 'Trend' ? "Minimize" : "Maximize"}
                        >
                            {expandedChart === 'Trend' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                    <div style={{ width: '100%', height: expandedChart === 'Trend' ? 'calc(100% - 80px)' : 350 }}>
                        {chartsReady && (
                            <ResponsiveContainer width="100%" height={expandedChart === 'Trend' ? '100%' : 350} minWidth={0} minHeight={0}>
                                <BarChart data={stackedTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                        interval={0}
                                        angle={-45}
                                        textAnchor="end"
                                        height={60}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    {/* stackKeys sorted largest-first renders largest at bottom of stack */}
                                    {stackKeys.map((key, index) => (
                                        <Bar
                                            key={key}
                                            dataKey={key}
                                            stackId="spend"
                                            fill={colorMap[key] || '#8b5cf6'}
                                            radius={index === stackKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Bottom Section: Breakdown Chart + Table */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Breakdown Chart */}
                    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 ${expandedChart === 'Breakdown' ? 'fixed inset-4 z-50 p-6' : 'p-6'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-900">
                                Total: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalCost)}
                            </h3>
                            <button
                                onClick={() => setExpandedChart(expandedChart === 'Breakdown' ? null : 'Breakdown')}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                                title={expandedChart === 'Breakdown' ? "Minimize" : "Maximize"}
                            >
                                {expandedChart === 'Breakdown' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                        </div>
                        <div style={{ width: '100%', height: expandedChart === 'Breakdown' ? 'calc(100% - 60px)' : 300 }}>
                            {chartsReady && (
                                <ResponsiveContainer width="100%" height={expandedChart === 'Breakdown' ? '100%' : 300} minWidth={0} minHeight={0}>
                                    <BarChart data={aggregatedData} layout="vertical" margin={{ left: 10, right: 10 }}>
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            width={120}
                                            tick={{ fontSize: 11, fill: '#64748b' }}
                                            interval={0}
                                            tickFormatter={(value) => value.length > 18 ? value.slice(0, 18) + '...' : value}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                            formatter={(value: any) => [`$${value?.toLocaleString()}`, 'Cost']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={24}>
                                            {aggregatedData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-y-auto max-h-[400px]">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">{groupBy}</th>
                                        <th className="px-4 py-3 font-medium text-right">Total Cost</th>
                                        <th className="px-4 py-3 font-medium text-right">% of Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {aggregatedData.map((row, index) => {
                                        // Find line items matching this row for navigation
                                        const matchingItems = lineItems.filter(item => {
                                            if (!item.billingMonth) return false;
                                            const itemBillingDate = parseISO(item.billingMonth);
                                            const inRange = monthRange.some(month => isSameMonth(itemBillingDate, month));
                                            if (!inRange) return false;

                                            const key = groupBy === 'Service'
                                                ? extractServiceName(item.description)
                                                : (item.vendorName || 'Unknown Vendor');
                                            return key === row.name;
                                        });

                                        const hasManualOverrides = matchingItems.some(item => item.isManualOverride);
                                        const firstItem = matchingItems[0];

                                        return (
                                            <tr
                                                key={index}
                                                className="transition-colors hover:bg-slate-50 cursor-pointer group"
                                                onClick={() => {
                                                    if (firstItem) {
                                                        handleRowClick(firstItem.subscriptionId, firstItem.vendorName);
                                                    }
                                                }}
                                                title="Click to view invoices and make corrections"
                                            >
                                                <td className="px-4 py-3 font-medium text-slate-900">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                                                        <span className="truncate">{row.name}</span>
                                                        {hasManualOverrides && (
                                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-normal">
                                                                adjusted
                                                            </span>
                                                        )}
                                                        <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors ml-auto" />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-900 font-medium">
                                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(row.cost)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-500">
                                                    {row.percentage.toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {aggregatedData.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                                                No data for selected period
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {aggregatedData.length > 0 && (
                                    <tfoot className="bg-slate-50 border-t border-slate-200">
                                        <tr>
                                            <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalCost)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-500 font-medium">100%</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
