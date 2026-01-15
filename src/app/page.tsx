'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { subscriptionService } from '@/services/subscriptionService';
import type { Subscription, Invoice, Vendor } from '@/types';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { SubscriptionTable } from '@/components/dashboard/SubscriptionTable';
import { ActionsBar } from '@/components/dashboard/ActionsBar';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DollarSign, Layers, CreditCard, AlertCircle, Building2, FileText, CheckCircle, TrendingUp, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [vendors, setVendors] = useState<VendorWithStats[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithVendor[]>([]);
  const [lineItems, setLineItems] = useState<LineItemWithBillingMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'pending'>('all');

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

  // Calculate summary metrics
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // 1. Total YTD Spend
  const spendYTD = invoices.reduce((acc, inv) => {
    const invDate = new Date(inv.invoiceDate);
    if (invDate >= startOfYear) {
      return acc + (inv.totalAmount || 0);
    }
    return acc;
  }, 0);

  // 2. Paid YTD
  const paidYTD = invoices.reduce((acc, inv) => {
    const invDate = new Date(inv.invoiceDate);
    if (inv.status === 'Paid' && invDate >= startOfYear) {
      return acc + (inv.totalAmount || 0);
    }
    return acc;
  }, 0);

  // 3. Outstanding (Pending or Overdue - All Time)
  const outstandingAmount = invoices.reduce((acc, inv) => {
    if (inv.status === 'Pending' || inv.status === 'Overdue') {
      return acc + (inv.totalAmount || 0);
    }
    return acc;
  }, 0);

  // 4. Projected Annual Spend (Fixed Calculation)
  // Calculate annualized cost of active subscriptions
  const projectedAnnualSpend = subscriptions.reduce((acc, sub) => {
    if (sub.status === 'Cancelled') return acc;
    // ensure cost is treated as number
    const cost = Number(sub.cost) || 0;
    const annualCost = sub.billingCycle === 'Monthly' ? cost * 12 : cost;
    return acc + annualCost;
  }, 0);

  // Fallback: If no subscription cost data, forecast based on last month's invoice spend * 12
  // Or just keep it separate. If 0, we can prompt identifying questions?
  // Let's stick to strict subscription data for now to encourage data entry.

  const pendingInvoicesCount = invoices.filter(inv => inv.status === 'Pending').length;

  // Find oldest outstanding invoice date
  const oldestPendingDate = invoices
    .filter(inv => inv.status === 'Pending' || inv.status === 'Overdue')
    .map(inv => new Date(inv.invoiceDate))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const formattedOldestPending = oldestPendingDate
    ? `Oldest: ${format(oldestPendingDate, 'MMM d, yyyy')}`
    : 'No outstanding items';


  // Calculate Spend (Last 12 Months) for the secondary card
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const spendLast12Months = invoices.reduce((acc, inv) => {
    const invDate = new Date(inv.invoiceDate);
    if (invDate >= oneYearAgo) {
      return acc + (inv.totalAmount || 0);
    }
    return acc;
  }, 0);



  // Aliases for compatibility with existing JSX below
  const totalInvoicedSpend = invoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
  const pendingInvoices = pendingInvoicesCount;


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

  const handleMarkPaid = async (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    // Optimistic update
    setInvoices(prev => prev.map(inv =>
      inv.id === invoiceId ? { ...inv, status: 'Paid' } : inv
    ));

    try {
      await subscriptionService.updateInvoice(invoiceId, { status: 'Paid' });
    } catch (err) {
      console.error('Failed to mark as paid', err);
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
            label={`Total Spend YTD (${new Date().getFullYear()})`}
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
            subtext={outstandingAmount > 0 ? `${pendingInvoicesCount} invoices • ${formattedOldestPending}` : "All clear"}
          />
          <StatsCard
            label="Projected Annual Spend"
            value={formatCurrency(projectedAnnualSpend)}
            icon={TrendingUp}
          />
        </div>

        {/* Secondary Metrics - Invoice-based */}
        {invoices.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-violet-100 text-sm font-medium">Spend (Last 12 Months)</p>
                  <p className="text-3xl font-bold mt-1">{formatCurrency(spendLast12Months)}</p>
                </div>
                <FileText className="w-10 h-10 text-violet-200 opacity-80" />
              </div>
              <p className="text-violet-200 text-xs mt-3">Rolling 12-month period</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">Pending Invoices</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">{pendingInvoicesCount}</p>
                </div>
                <AlertCircle className="w-10 h-10 text-amber-200" />
              </div>
              <div className="flex justify-between items-center mt-3">
                <p className="text-slate-400 text-xs">Requires attention</p>
                <button
                  onClick={() => {
                    setInvoiceFilter('pending');
                    document.getElementById('recent-invoices')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded"
                >
                  Review
                </button>
              </div>
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
          <div id="recent-invoices" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-900">Recent Invoices</h3>
              <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                <button
                  onClick={() => setInvoiceFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${invoiceFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  All
                </button>
                <button
                  onClick={() => setInvoiceFilter('pending')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${invoiceFilter === 'pending'
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  Pending ({pendingInvoicesCount})
                </button>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {invoices
                .filter(inv => invoiceFilter === 'all' || inv.status === 'Pending')
                .slice(0, 10).map((invoice) => (
                  <div
                    key={invoice.id}
                    onClick={() => {
                      if (invoice.subscriptionId) {
                        router.push(`/subscriptions/${invoice.subscriptionId}?tab=invoices`);
                      }
                    }}
                    className={`p-4 flex items-center justify-between transition-colors ${invoice.subscriptionId ? 'hover:bg-slate-50 cursor-pointer' : ''
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${invoice.status === 'Pending' ? 'bg-amber-100' : 'bg-violet-100'
                        }`}>
                        <FileText className={`w-5 h-5 ${invoice.status === 'Pending' ? 'text-amber-600' : 'text-violet-600'
                          }`} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">#{invoice.invoiceNumber || 'N/A'}</p>
                        <p className="text-sm text-slate-500">{invoice.vendorName || 'Unknown Vendor'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-semibold text-slate-800">{formatCurrency(invoice.totalAmount)}</p>
                        <p className={`text-xs ${invoice.status === 'Pending' ? 'text-amber-600 font-medium' : 'text-slate-400'
                          }`}>
                          {invoice.status === 'Pending' ? 'Due ' + formatDate(invoice.dueDate || invoice.invoiceDate) : formatDate(invoice.invoiceDate)}
                        </p>
                      </div>
                      {invoice.status === 'Pending' && (
                        <button
                          onClick={(e) => handleMarkPaid(e, invoice.id)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600 text-xs font-medium rounded-lg shadow-sm transition-all"
                        >
                          Mark Paid
                        </button>
                      )}
                      {(invoice.status !== 'Pending' || !invoice.status) && (
                        <div className="w-[74px]"></div>
                      )}
                    </div>
                  </div>
                ))}
              {invoices.filter(inv => invoiceFilter === 'all' || inv.status === 'Pending').length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No invoices found.
                </div>
              )}
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
