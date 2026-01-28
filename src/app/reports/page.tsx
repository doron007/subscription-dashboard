'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Download, TrendingUp, Maximize2, Minimize2, Filter, X, Search, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { MultiSelect } from '@/components/ui/MultiSelect';
import Papa from 'papaparse';
import {
    format, parseISO, startOfYear, endOfYear, startOfQuarter, endOfQuarter,
    subMonths, subQuarters, subYears, startOfMonth, endOfMonth
} from 'date-fns';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16', '#f97316', '#14b8a6'];

type GroupByOption = 'vendor' | 'service';
type QuickFilter = 'TTM' | 'Last Year' | 'YTD' | 'Last Quarter' | 'Last Month' | 'Current Month' | 'Custom';
type ExpandedChart = 'Trend' | 'Breakdown' | null;

interface AggregatedData {
    name: string;
    cost: number;
    percentage: number;
    colorIndex: number;
}

interface MonthlyTrendPoint {
    month: string;
    label: string;
    total: number;
    [key: string]: any;
}

interface ReportData {
    monthlyTrend: MonthlyTrendPoint[];
    breakdown: AggregatedData[];
    stackKeys: string[];
    grandTotal: number;
    filters: {
        availableMonths: string[];
        availableVendors: string[];
        availableServices: string[];
    };
    meta: {
        startDate: string;
        endDate: string;
        groupBy: string;
        lineItemCount: number;
    };
}

// Calculate date range for quick filters
function getDateRange(filter: QuickFilter, customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
    const now = new Date();

    switch (filter) {
        case 'TTM':
            // Trailing 12 months ending last month
            return {
                startDate: format(startOfMonth(subMonths(now, 12)), 'yyyy-MM-dd'),
                endDate: format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
            };
        case 'Last Year':
            return {
                startDate: format(startOfYear(subYears(now, 1)), 'yyyy-MM-dd'),
                endDate: format(endOfYear(subYears(now, 1)), 'yyyy-MM-dd')
            };
        case 'YTD':
            return {
                startDate: format(startOfYear(now), 'yyyy-MM-dd'),
                endDate: format(endOfMonth(now), 'yyyy-MM-dd')
            };
        case 'Last Quarter':
            return {
                startDate: format(startOfQuarter(subQuarters(now, 1)), 'yyyy-MM-dd'),
                endDate: format(endOfQuarter(subQuarters(now, 1)), 'yyyy-MM-dd')
            };
        case 'Last Month':
            return {
                startDate: format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'),
                endDate: format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
            };
        case 'Current Month':
            return {
                startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
                endDate: format(endOfMonth(now), 'yyyy-MM-dd')
            };
        case 'Custom':
            return {
                startDate: customStart || format(startOfMonth(subMonths(now, 12)), 'yyyy-MM-dd'),
                endDate: customEnd || format(endOfMonth(now), 'yyyy-MM-dd')
            };
    }
}

export default function ReportsPage() {
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<ReportData | null>(null);

    // Controls
    const [groupBy, setGroupBy] = useState<GroupByOption>('vendor');
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('TTM');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');

    // Client-side filters (applied to already-aggregated data)
    // Client-side filters (applied to already-aggregated data)
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');

    // UI State
    const [expandedChart, setExpandedChart] = useState<ExpandedChart>(null);
    const [chartsReady, setChartsReady] = useState(false);
    const [hoveredStackItem, setHoveredStackItem] = useState<string | null>(null);

    // Fetch aggregated data from server
    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const { startDate, endDate } = getDateRange(quickFilter, customStartDate, customEndDate);
            const data = await subscriptionService.getAggregatedReport({
                startDate,
                endDate,
                groupBy
            });
            setReportData(data);
        } catch (error) {
            console.error('Failed to fetch report:', error);
        } finally {
            setLoading(false);
        }
    }, [quickFilter, customStartDate, customEndDate, groupBy]);

    // Fetch on mount and when filters change
    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    // Delay chart rendering until after layout
    useEffect(() => {
        const frame1 = requestAnimationFrame(() => {
            const frame2 = requestAnimationFrame(() => {
                setChartsReady(true);
            });
            return () => cancelAnimationFrame(frame2);
        });
        return () => cancelAnimationFrame(frame1);
    }, []);

    // Apply client-side filters to the aggregated data
    const filteredBreakdown = useMemo(() => {
        if (!reportData) return [];

        let filtered = reportData.breakdown;

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item => item.name.toLowerCase().includes(query));
        }

        // Vendor/Service filter (depending on groupBy)
        if (groupBy === 'vendor' && selectedVendors.length > 0) {
            filtered = filtered.filter(item => selectedVendors.includes(item.name));
        }
        if (groupBy === 'service' && selectedServices.length > 0) {
            filtered = filtered.filter(item => selectedServices.includes(item.name));
        }

        return filtered;
    }, [reportData, searchQuery, groupBy, selectedVendors, selectedServices]);

    // Filter monthly trend data
    const filteredTrend = useMemo(() => {
        if (!reportData) return [];

        let trend = reportData.monthlyTrend;

        // Month filter
        if (selectedMonths.length > 0) {
            trend = trend.filter(point => selectedMonths.includes(point.month));
        }

        // If we have a vendor/service filter, recalculate totals
        if ((groupBy === 'vendor' && selectedVendors.length > 0) || (groupBy === 'service' && selectedServices.length > 0)) {
            trend = trend.map(point => {
                let newTotal = 0;
                // Only sum up the selected vendors/services
                if (groupBy === 'vendor') {
                    selectedVendors.forEach(v => {
                        newTotal += (point[v] || 0);
                    })
                } else {
                    selectedServices.forEach(s => {
                        newTotal += (point[s] || 0);
                    })
                }

                return {
                    ...point,
                    total: newTotal
                };
            });
        }

        // Search filter - filter to matching keys only
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchingKeys = reportData.stackKeys.filter(key => key.toLowerCase().includes(query));
            trend = trend.map(point => {
                const newPoint: MonthlyTrendPoint = {
                    month: point.month,
                    label: point.label,
                    total: 0
                };
                matchingKeys.forEach(key => {
                    newPoint[key] = point[key] || 0;
                    newPoint.total += point[key] || 0;
                });
                return newPoint;
            });
        }

        return trend;
    }, [reportData, selectedMonths, groupBy, selectedVendors, selectedServices, searchQuery]);

    // Get visible stack keys based on filters
    const visibleStackKeys = useMemo(() => {
        if (!reportData) return [];

        let keys = reportData.stackKeys;

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            keys = keys.filter(key => key.toLowerCase().includes(query));
        }

        if (groupBy === 'vendor' && selectedVendors.length > 0) {
            keys = keys.filter(key => selectedVendors.includes(key));
        }
        if (groupBy === 'service' && selectedServices.length > 0) {
            keys = keys.filter(key => selectedServices.includes(key));
        }

        return keys;
    }, [reportData, searchQuery, groupBy, selectedVendors, selectedServices]);

    // Color map for consistent colors
    const colorMap = useMemo(() => {
        const map: Record<string, string> = {};
        reportData?.stackKeys.forEach((key, index) => {
            map[key] = COLORS[index % COLORS.length];
        });
        return map;
    }, [reportData]);

    // Month breakdown data (aggregated if multiple months selected)
    const monthBreakdownData = useMemo(() => {
        if (!reportData) return [];
        if (selectedMonths.length === 0) return []; // Should rely on total breakdown if no specific month

        // Aggregate data for all selected months
        const relevantMonths = reportData.monthlyTrend.filter(p => selectedMonths.includes(p.month));

        const breakdownMap = new Map<string, number>();
        let total = 0;

        if (relevantMonths.length === 0) return [];

        relevantMonths.forEach(monthData => {
            reportData.stackKeys.forEach(key => {
                const cost = monthData[key] || 0;
                if (cost > 0) {
                    breakdownMap.set(key, (breakdownMap.get(key) || 0) + cost);
                    total += cost;
                }
            });
        });

        const breakdown: AggregatedData[] = [];
        breakdownMap.forEach((cost, key) => {
            // Apply search filter
            if (searchQuery && !key.toLowerCase().includes(searchQuery.toLowerCase())) {
                return;
            }
            breakdown.push({
                name: key,
                cost,
                percentage: total > 0 ? (cost / total) * 100 : 0,
                colorIndex: reportData.stackKeys.indexOf(key)
            });
        });

        return breakdown.sort((a, b) => b.cost - a.cost);
    }, [selectedMonths, reportData, searchQuery]);


    const handleExport = async () => {
        if (!reportData) return;

        const rows: any[] = [];
        const groupLabel = groupBy === 'vendor' ? 'Vendor' : 'Service';

        // Metadata header
        rows.push({
            'Month': `Report: ${groupLabel} Spend`,
            [groupLabel]: `Period: ${quickFilter}`,
            'Amount': `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`
        });
        rows.push({});

        // Monthly data
        filteredTrend.forEach(monthData => {
            visibleStackKeys.forEach(key => {
                const amount = monthData[key] || 0;
                if (amount > 0) {
                    rows.push({
                        'Month': monthData.month,
                        [groupLabel]: key,
                        'Amount': Math.round(amount * 100) / 100
                    });
                }
            });
            if (monthData.total > 0) {
                rows.push({
                    'Month': monthData.month,
                    [groupLabel]: '** Monthly Total **',
                    'Amount': Math.round(monthData.total * 100) / 100
                });
            }
        });

        // Summary
        rows.push({});
        rows.push({ 'Month': `=== SUMMARY BY ${groupLabel.toUpperCase()} ===` });
        filteredBreakdown.forEach(d => {
            rows.push({
                'Month': d.name,
                [groupLabel]: Math.round(d.cost * 100) / 100,
                'Amount': `${d.percentage.toFixed(1)}%`
            });
        });

        const totalCost = filteredBreakdown.reduce((sum, d) => sum + d.cost, 0);
        rows.push({
            'Month': 'GRAND TOTAL',
            [groupLabel]: Math.round(totalCost * 100) / 100,
            'Amount': '100%'
        });

        const csv = Papa.unparse(rows);
        const filename = `report_${groupBy}_${quickFilter.replace(/\s+/g, '_').toLowerCase()}_${format(new Date(), 'yyyyMMdd')}.csv`;

        // Try File System Access API first
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(csv);
                await writable.close();
                return;
            } catch (err: any) {
                if (err.name === 'AbortError') return;
            }
        }

        // Fallback
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

    // Custom tooltip with month total at top
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;

        const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);

        return (
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-3 min-w-[220px]">
                {/* Month header with total */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200">
                    <span className="font-bold text-slate-900">{label}</span>
                    <span className="font-bold text-indigo-600">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {/* Vendor/Service breakdown */}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {payload
                        .filter((entry: any) => entry.value > 0)
                        .sort((a: any, b: any) => b.value - a.value)
                        .map((entry: any, index: number) => {
                            const isHovered = entry.dataKey === hoveredStackItem;
                            return (
                                <div
                                    key={index}
                                    className={`flex items-center justify-between gap-4 text-sm transition-all duration-200 ${isHovered ? 'bg-indigo-50 -mx-2 px-2 py-1 rounded-md' : 'py-0.5'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                        <span className={`truncate max-w-[130px] ${isHovered ? 'text-indigo-900 font-semibold' : 'text-slate-600'}`}>{entry.dataKey}</span>
                                    </div>
                                    <span className={`font-medium ${isHovered ? 'text-indigo-700 font-bold' : 'text-slate-900'}`}>${entry.value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                            );
                        })}
                </div>
            </div>
        );
    };

    const totalCost = filteredBreakdown.reduce((sum, d) => sum + d.cost, 0);
    const { startDate: rangeStart, endDate: rangeEnd } = getDateRange(quickFilter, customStartDate, customEndDate);

    if (loading && !reportData) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-7xl mx-auto">

                {/* Overlay for expanded mode */}
                {expandedChart && <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setExpandedChart(null)} />}

                {/* Header & Controls */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                            Advanced Analytics
                            {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                        </h1>
                        <p className="text-slate-500 text-xs mt-1">
                            Analyze spend trends by {groupBy} over time.
                            {reportData && <span className="text-slate-400 ml-2">({reportData.meta.lineItemCount.toLocaleString()} line items)</span>}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Quick Filter */}
                        <select
                            value={quickFilter}
                            onChange={(e) => {
                                setQuickFilter(e.target.value as QuickFilter);
                                setSelectedMonths([]);
                            }}
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

                        {/* Custom Date Picker */}
                        {quickFilter === 'Custom' && (
                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="bg-transparent border-none p-0 text-xs font-medium focus:ring-0 text-slate-700 w-28"
                                />
                                <span className="text-slate-400">→</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
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
                            <option value="vendor">Group: Vendor</option>
                            <option value="service">Group: Service</option>
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

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 mr-2">
                        <Filter className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Filters:</span>
                    </div>

                    {/* Smart Search */}
                    <div className="relative group">
                        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search vendor, service..."
                            className="pl-9 pr-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500 w-48 transition-all focus:w-64 focus:bg-white"
                        />
                    </div>

                    {/* Month Filter */}
                    <MultiSelect
                        placeholder="All Months"
                        options={reportData?.filters.availableMonths.map(m => ({ label: format(parseISO(m + '-01'), 'MMM yyyy'), value: m })) || []}
                        selected={selectedMonths}
                        onChange={setSelectedMonths}
                        className="w-48"
                    />

                    {/* Vendor Filter */}
                    <MultiSelect
                        placeholder="All Vendors"
                        options={reportData?.filters.availableVendors.map(v => ({ label: v, value: v })) || []}
                        selected={selectedVendors}
                        onChange={setSelectedVendors}
                        className="w-48"
                    />

                    {/* Service Filter */}
                    <MultiSelect
                        placeholder="All Services"
                        options={reportData?.filters.availableServices.map(s => ({ label: s, value: s })) || []}
                        selected={selectedServices}
                        onChange={setSelectedServices}
                        className="w-48"
                    />

                    {/* Clear Filters */}
                    {(selectedMonths.length > 0 || selectedVendors.length > 0 || selectedServices.length > 0 || searchQuery) && (
                        <button
                            onClick={() => {
                                setSelectedMonths([]);
                                setSelectedVendors([]);
                                setSelectedServices([]);
                                setSearchQuery('');
                            }}
                            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-lg ml-auto transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                            Clear
                        </button>
                    )}
                </div>

                {/* Stacked Trend Chart */}
                <div className={`bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 ${expandedChart === 'Trend' ? 'fixed inset-4 z-50 p-6' : 'p-6'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">
                                {selectedMonths.length > 0
                                    ? `Top Spending ${groupBy === 'vendor' ? 'Vendors' : 'Services'} in Selected Months`
                                    : `Monthly Spend by ${groupBy === 'vendor' ? 'Vendor' : 'Service'}`
                                }
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {selectedMonths.length > 0
                                    ? 'Click on a bar to filter by that item, or clear the month filter to go back.'
                                    : `${format(parseISO(rangeStart), 'MMM yyyy')} - ${format(parseISO(rangeEnd), 'MMM yyyy')}`
                                }
                                {' • '}Total: <span className="font-semibold text-slate-700">${(selectedMonths.length > 0 ? monthBreakdownData.reduce((sum, d) => sum + d.cost, 0) : totalCost).toLocaleString()}</span>
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
                    <div style={{ width: '100%', height: expandedChart === 'Trend' ? 'calc(100% - 80px)' : (selectedMonths.length > 0 ? Math.max(350, monthBreakdownData.length * 32) : 350) }}>
                        {chartsReady && (
                            <ResponsiveContainer width="100%" height={expandedChart === 'Trend' ? '100%' : (selectedMonths.length === 1 ? Math.max(350, monthBreakdownData.length * 32) : 350)} minWidth={0} minHeight={0}>
                                {selectedMonths.length === 1 ? (
                                    /* Month Selected: Pareto Chart */
                                    <BarChart data={monthBreakdownData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }} barCategoryGap="20%">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            width={180}
                                            tick={{ fontSize: 12, fill: '#64748b' }}
                                            interval={0}
                                            tickFormatter={(value) => value.length > 22 ? value.slice(0, 22) + '...' : value}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                            formatter={(value: any) => [`$${value?.toLocaleString()}`, 'Cost']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            wrapperStyle={{ zIndex: 1000 }}
                                        />
                                        <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={24}>
                                            {monthBreakdownData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={COLORS[entry.colorIndex % COLORS.length]}
                                                    className="cursor-pointer hover:opacity-80"
                                                    onClick={() => {
                                                        if (groupBy === 'vendor') {
                                                            if (selectedVendors.includes(entry.name)) {
                                                                setSelectedVendors(selectedVendors.filter(v => v !== entry.name));
                                                            } else {
                                                                setSelectedVendors([...selectedVendors, entry.name]);
                                                            }
                                                        }
                                                        if (groupBy === 'service') {
                                                            if (selectedServices.includes(entry.name)) {
                                                                setSelectedServices(selectedServices.filter(s => s !== entry.name));
                                                            } else {
                                                                setSelectedServices([...selectedServices, entry.name]);
                                                            }
                                                        }
                                                    }}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                ) : (
                                    /* Stacked Trend Chart */
                                    <BarChart
                                        data={filteredTrend}
                                        margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                                        onClick={(state) => {
                                            if (state && state.activeLabel) {
                                                const clickedPoint = filteredTrend.find(p => p.label === state.activeLabel);
                                                if (clickedPoint) {
                                                    if (selectedMonths.includes(clickedPoint.month)) {
                                                        setSelectedMonths(selectedMonths.filter(m => m !== clickedPoint.month));
                                                    } else {
                                                        setSelectedMonths([...selectedMonths, clickedPoint.month]);
                                                    }
                                                }
                                            }
                                        }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="label"
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
                                        <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1000 }} />
                                        {visibleStackKeys.map((key, index) => (
                                            <Bar
                                                key={key}
                                                dataKey={key}
                                                stackId="spend"
                                                fill={colorMap[key] || '#8b5cf6'}
                                                radius={index === visibleStackKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                                onMouseEnter={() => setHoveredStackItem(key)}
                                                onMouseLeave={() => setHoveredStackItem(null)}
                                                onClick={(data, idx, event) => {
                                                    if (event && event.stopPropagation) event.stopPropagation();
                                                    if (groupBy === 'vendor') {
                                                        if (selectedVendors.includes(key)) {
                                                            setSelectedVendors(selectedVendors.filter(v => v !== key));
                                                        } else {
                                                            setSelectedVendors([...selectedVendors, key]);
                                                        }
                                                    }
                                                    if (groupBy === 'service') {
                                                        if (selectedServices.includes(key)) {
                                                            setSelectedServices(selectedServices.filter(s => s !== key));
                                                        } else {
                                                            setSelectedServices([...selectedServices, key]);
                                                        }
                                                    }
                                                }}
                                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                            />
                                        ))}
                                    </BarChart>
                                )}
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
                        <div style={{ width: '100%', height: expandedChart === 'Breakdown' ? 'calc(100% - 60px)' : Math.max(filteredBreakdown.length * 40, 300) }}>
                            {chartsReady && (
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <BarChart data={filteredBreakdown} layout="vertical" margin={{ left: 10, right: 10 }}>
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            width={220}
                                            tick={{ fontSize: 11, fill: '#64748b' }}
                                            interval={0}
                                            tickFormatter={(value) => value.length > 20 ? value.slice(0, 20) + '...' : value}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                            formatter={(value: any) => [`$${value?.toLocaleString()}`, 'Cost']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={24}>
                                            {filteredBreakdown.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={COLORS[entry.colorIndex % COLORS.length]}
                                                    className="cursor-pointer hover:opacity-80"
                                                    onClick={() => {
                                                        if (groupBy === 'vendor') {
                                                            if (selectedVendors.includes(entry.name)) {
                                                                setSelectedVendors(selectedVendors.filter(v => v !== entry.name));
                                                            } else {
                                                                setSelectedVendors([...selectedVendors, entry.name]);
                                                            }
                                                        }
                                                        if (groupBy === 'service') {
                                                            if (selectedServices.includes(entry.name)) {
                                                                setSelectedServices(selectedServices.filter(s => s !== entry.name));
                                                            } else {
                                                                setSelectedServices([...selectedServices, entry.name]);
                                                            }
                                                        }
                                                    }}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">{groupBy === 'vendor' ? 'Vendor' : 'Service'}</th>
                                        <th className="px-4 py-3 font-medium text-right">Total Cost</th>
                                        <th className="px-4 py-3 font-medium text-right">% of Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredBreakdown.map((row, index) => (
                                        <tr
                                            key={index}
                                            className="transition-colors hover:bg-slate-50 cursor-pointer group"
                                            onClick={() => {
                                                if (groupBy === 'vendor') {
                                                    if (selectedVendors.includes(row.name)) {
                                                        setSelectedVendors(selectedVendors.filter(v => v !== row.name));
                                                    } else {
                                                        setSelectedVendors([...selectedVendors, row.name]);
                                                    }
                                                }
                                                if (groupBy === 'service') {
                                                    if (selectedServices.includes(row.name)) {
                                                        setSelectedServices(selectedServices.filter(s => s !== row.name));
                                                    } else {
                                                        setSelectedServices([...selectedServices, row.name]);
                                                    }
                                                }
                                            }}
                                            title="Click to filter by this item"
                                        >
                                            <td className="px-4 py-3 font-medium text-slate-900">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[row.colorIndex % COLORS.length] }} />
                                                    <span className="truncate">{row.name}</span>
                                                    <Filter className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors ml-auto" />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-900 font-medium">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(row.cost)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-500">
                                                {row.percentage.toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredBreakdown.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                                                No data for selected period
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {filteredBreakdown.length > 0 && (
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
