'use client';

import { useEffect, useState } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { Subscription } from '@/types';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { SubscriptionTable } from '@/components/dashboard/SubscriptionTable';
import { ActionsBar } from '@/components/dashboard/ActionsBar';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DollarSign, Layers, CreditCard, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function Dashboard() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await subscriptionService.getAll();
        setSubscriptions(data);
      } catch (err) {
        console.error("Failed to load subscriptions", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Calculate summary metrics
  const totalAnnualSpend = subscriptions.reduce((acc, sub) => {
    if (sub.status === 'Cancelled') return acc;
    const annualCost = sub.billingCycle === 'Monthly' ? sub.cost * 12 : sub.cost;
    return acc + annualCost;
  }, 0);

  const activeSubs = subscriptions.filter(s => s.status === 'Active').length;
  const reviewSubs = subscriptions.filter(s => s.status === 'Review').length;

  const upcomingRenewals = subscriptions.filter(sub => {
    if (!sub.renewalDate || sub.status === 'Cancelled') return false;
    const today = new Date();
    const renewal = new Date(sub.renewalDate);
    const diffTime = renewal.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }).length;

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

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            label="Total Annual Spend"
            value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(totalAnnualSpend)}
            // trend={{ value: 0, isPositive: true }} // TODO: Implement historical tracking
            icon={DollarSign}
          />
          <StatsCard
            label="Active Subscriptions"
            value={activeSubs.toString()}
            // trend={{ value: 0, isPositive: true }}
            icon={Layers}
          />
          <StatsCard
            label="Upcoming Renewals (30d)"
            value={upcomingRenewals.toString()}
            icon={CreditCard}
          />
          <StatsCard
            label="Utilization Alert"
            value={reviewSubs.toString()}
            icon={AlertCircle}
          />
        </div>

        {/* Charts */}
        <DashboardCharts subscriptions={subscriptions} />

        {/* Main Content */}
        <SubscriptionTable subscriptions={subscriptions} limit={5} enableSearch={true} />

      </div>
    </DashboardLayout>
  );
}
