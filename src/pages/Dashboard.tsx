import { subscriptions } from '../data/mock';
import { StatsCard } from '../components/dashboard/StatsCard';
import { SubscriptionTable } from '../components/dashboard/SubscriptionTable';
import { DollarSign, Layers, CreditCard, AlertCircle } from 'lucide-react';

export function Dashboard() {
    // Calculate summary metrics
    const totalSpend = subscriptions.reduce((acc, sub) => acc + sub.cost, 0); // Simplified (annual vs monthly mix ignored for mock)
    const activeSubs = subscriptions.filter(s => s.status === 'Active').length;
    const reviewSubs = subscriptions.filter(s => s.status === 'Review').length;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Overview</h1>
                    <p className="text-slate-500 mt-1">Manage your organization's software spend and usage.</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                        Download Report
                    </button>
                    <button className="px-4 py-2 bg-slate-900 text-slate-50 font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm">
                        Add Subscription
                    </button>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatsCard
                    label="Total Annual Spend"
                    value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(totalSpend)}
                    trend={{ value: 12, isPositive: false }} // Spending went up (bad usually)
                    icon={DollarSign}
                />
                <StatsCard
                    label="Active Subscriptions"
                    value={activeSubs.toString()}
                    trend={{ value: 2, isPositive: true }}
                    icon={Layers}
                />
                <StatsCard
                    label="Upcoming Renewals (30d)"
                    value="3"
                    icon={CreditCard}
                />
                <StatsCard
                    label="Utilization Alert"
                    value={reviewSubs.toString()}
                    icon={AlertCircle}
                />
            </div>

            {/* Main Content */}
            <SubscriptionTable subscriptions={subscriptions} />

        </div>
    );
}
