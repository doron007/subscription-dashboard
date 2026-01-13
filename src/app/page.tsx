'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { subscriptionService } from '@/services/subscriptionService';
import type { Subscription, Invoice, Vendor } from '@/types';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { SubscriptionTable } from '@/components/dashboard/SubscriptionTable';
import { ActionsBar } from '@/components/dashboard/ActionsBar';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DollarSign, Layers, CreditCard, AlertCircle, Building2, FileText } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

const DashboardCharts = dynamic(
  () => import('@/components/dashboard/DashboardCharts').then(mod => mod.DashboardCharts),
  { ssr: false }
);

interface VendorWithStats extends Vendor {
  subscriptionCount: number;
  invoiceCount: number;
  totalSpend: number;
}

interface InvoiceWithVendor extends Invoice {
  vendorName?: string;
}

interface LineItemWithBillingMonth {
  id: string;
  totalAmount: number;
  billingMonth: string;
  vendorName: string;
}

export default function Dashboard() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [vendors, setVendors] = useState<VendorWithStats[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithVendor[]>([]);
  const [lineItems, setLineItems] = useState<LineItemWithBillingMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [subsData, vendorsData, invoicesData, lineItemsData] = await Promise.all([
          subscriptionService.getAll(),
          subscriptionService.getVendors().catch(() => []),
          subscriptionService.getInvoices().catch(() => []),
          subscriptionService.getAllLineItems().catch(() => [])
        ]);
        setSubscriptions(subsData);
        setVendors(vendorsData);
        setInvoices(invoicesData);
        setLineItems(lineItemsData);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Calculate summary metrics - prefer invoice data when available
  // Calculate spend for trailing 13 months (for YoY comparison)
  const thirteenMonthsAgo = new Date();
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

  const trailingSpend = invoices.reduce((acc, inv) => {
    const invDate = new Date(inv.invoiceDate);
    if (invDate >= thirteenMonthsAgo) {
      return acc + (inv.totalAmount || 0);
    }
    return acc;
  }, 0);

  const totalInvoicedSpend = invoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);

  // Use trailing 13 months invoice data if available, otherwise fall back to subscription projection
  const totalAnnualSpend = trailingSpend > 0
    ? trailingSpend
    : subscriptions.reduce((acc, sub) => {
        if (sub.status === 'Cancelled') return acc;
        const annualCost = sub.billingCycle === 'Monthly' ? sub.cost * 12 : sub.cost;
        return acc + annualCost;
      }, 0);

  const activeSubs = subscriptions.filter(s => s.status === 'Active').length;
  const activeVendors = vendors.length;
  const pendingInvoices = invoices.filter(inv => inv.status === 'Pending').length;

  const upcomingRenewals = subscriptions.filter(sub => {
    if (!sub.renewalDate || sub.status === 'Cancelled') return false;
    const today = new Date();
    const renewal = new Date(sub.renewalDate);
    const diffTime = renewal.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }).length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[500px] text-slate-400">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Overview</h1>
            <p className="text-slate-500 mt-1">Manage your organization's software spend and usage.</p>
          </div>
          <ActionsBar />
        </div>

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            label={trailingSpend > 0 ? "Spend (Trailing 13 Months)" : `YTD Spend (${new Date().getFullYear()})`}
            value={formatCurrency(totalAnnualSpend)}
            icon={DollarSign}
          />
          <StatsCard
            label="Active Subscriptions"
            value={activeSubs.toString()}
            icon={Layers}
          />
          <StatsCard
            label="Active Vendors"
            value={activeVendors.toString()}
            icon={Building2}
          />
          <StatsCard
            label="Upcoming Renewals (30d)"
            value={upcomingRenewals.toString()}
            icon={CreditCard}
          />
        </div>

        {/* Secondary Metrics - Invoice-based */}
        {invoices.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-violet-100 text-sm font-medium">Documented Spend (Invoices)</p>
                  <p className="text-3xl font-bold mt-1">{formatCurrency(totalInvoicedSpend)}</p>
                </div>
                <FileText className="w-10 h-10 text-violet-200 opacity-80" />
              </div>
              <p className="text-violet-200 text-xs mt-3">{invoices.length} invoice(s) processed</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">Pending Invoices</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">{pendingInvoices}</p>
                </div>
                <AlertCircle className="w-10 h-10 text-amber-200" />
              </div>
              <p className="text-slate-400 text-xs mt-3">Requires attention</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">Top Vendor</p>
                  <p className="text-xl font-bold text-slate-800 mt-1 truncate">
                    {vendors.length > 0 ? vendors.sort((a, b) => b.totalSpend - a.totalSpend)[0]?.name : '-'}
                  </p>
                </div>
                <Building2 className="w-10 h-10 text-slate-200" />
              </div>
              <p className="text-slate-400 text-xs mt-3">
                {vendors.length > 0 && vendors.sort((a, b) => b.totalSpend - a.totalSpend)[0]?.totalSpend > 0
                  ? formatCurrency(vendors.sort((a, b) => b.totalSpend - a.totalSpend)[0].totalSpend)
                  : 'No spend data'}
              </p>
            </div>
          </div>
        )}

        {/* Recent Invoices Widget */}
        {invoices.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-900">Recent Invoices</h3>
              <span className="text-xs text-slate-500">{invoices.length} total</span>
            </div>
            <div className="divide-y divide-slate-100">
              {invoices.slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">#{invoice.invoiceNumber || 'N/A'}</p>
                      <p className="text-sm text-slate-500">{invoice.vendorName || 'Unknown Vendor'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-800">{formatCurrency(invoice.totalAmount)}</p>
                    <p className="text-xs text-slate-400">{formatDate(invoice.invoiceDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts */}
        <DashboardCharts subscriptions={subscriptions} invoices={invoices} lineItems={lineItems} />

        {/* Main Content */}
        <SubscriptionTable subscriptions={subscriptions} limit={5} enableSearch={true} />

      </div>
    </DashboardLayout>
  );
}
