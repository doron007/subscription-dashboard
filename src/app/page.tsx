'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DollarSign, AlertCircle, CheckCircle, CreditCard } from 'lucide-react';
import { AnalyticsView } from '@/components/analytics/AnalyticsView';

interface KpiData {
  spendYTD: number;
  paidYTD: number;
  outstandingAmount: number;
  unpaidCount: number;
  paymentStatusCounts: Record<string, number>;
  year: number;
}

export default function Dashboard() {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/reports/kpi', { cache: 'no-store' });
      if (res.ok) setKpi(await res.json());
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const now = new Date();

  const spendYTD = kpi?.spendYTD || 0;
  const paidYTD = kpi?.paidYTD || 0;
  const outstandingAmount = kpi?.outstandingAmount || 0;
  const unpaidCount = kpi?.unpaidCount || 0;

  const outstandingSubtext = outstandingAmount > 0
    ? `${unpaidCount} invoice${unpaidCount !== 1 ? 's' : ''} unpaid`
    : 'All clear';

  const psCounts = kpi?.paymentStatusCounts || {};
  const totalWithStatus = Object.entries(psCounts)
    .filter(([s]) => s !== 'Unknown')
    .reduce((sum, [, c]) => sum + c, 0);
  const sapPaidCount = psCounts['Paid'] || 0;

  const hasPaymentStatusData = totalWithStatus > 0;

  const paymentStatusSubtext = hasPaymentStatusData
    ? Object.entries(psCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status}: ${count}`)
        .join(' \u2022 ')
    : 'No SAP data available';

  const paymentStatusValue = totalWithStatus > 0
    ? `${sapPaidCount}/${totalWithStatus} Paid`
    : 'N/A';

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[500px] text-slate-400">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            label={`Total Spend YTD (${now.getFullYear()})`}
            value={formatCurrency(spendYTD)}
            icon={DollarSign}
          />
          <StatsCard
            label="Total Paid YTD"
            value={formatCurrency(paidYTD)}
            icon={CheckCircle}
          />
          <StatsCard
            label="Total Outstanding"
            value={formatCurrency(outstandingAmount)}
            icon={AlertCircle}
            subtext={outstandingSubtext}
          />
          <StatsCard
            label="SAP Payment Status"
            value={paymentStatusValue}
            icon={CreditCard}
            subtext={paymentStatusSubtext}
          />
        </div>

        {/* Analytics (formerly Reports page) */}
        <AnalyticsView />
      </div>
    </DashboardLayout>
  );
}
