'use client';

import { useEffect, useState, useCallback } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { Invoice } from '@/types';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { AnalyticsView } from '@/components/analytics/AnalyticsView';

interface InvoiceWithVendor extends Invoice {
  vendorName?: string;
}

export default function Dashboard() {
  const [invoices, setInvoices] = useState<InvoiceWithVendor[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const invoicesData = await subscriptionService.getInvoices().catch(() => []);
      setInvoices(invoicesData);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const spendYTD = invoices.reduce((acc, inv) => {
    return new Date(inv.invoiceDate) >= yearStart ? acc + (inv.totalAmount || 0) : acc;
  }, 0);

  const paidYTD = invoices.reduce((acc, inv) => {
    return inv.status === 'Paid' && new Date(inv.invoiceDate) >= yearStart ? acc + (inv.totalAmount || 0) : acc;
  }, 0);

  const outstandingAmount = invoices.reduce((acc, inv) => {
    return inv.status === 'Pending' || inv.status === 'Overdue' ? acc + (inv.totalAmount || 0) : acc;
  }, 0);

  const pendingCount = invoices.filter(inv => inv.status === 'Pending' || inv.status === 'Overdue').length;
  const oldestPending = invoices
    .filter(inv => inv.status === 'Pending' || inv.status === 'Overdue')
    .map(inv => new Date(inv.invoiceDate))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const outstandingSubtext = outstandingAmount > 0
    ? `${pendingCount} invoices${oldestPending ? ' \u2022 Oldest: ' + format(oldestPending, 'MMM d, yyyy') : ''}`
    : 'All clear';

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        </div>

        {/* Analytics (formerly Reports page) */}
        <AnalyticsView />
      </div>
    </DashboardLayout>
  );
}
