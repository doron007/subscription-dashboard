'use client';

import { useEffect, useState, useCallback } from 'react';
import { subscriptionService } from '@/services/subscriptionService';
import type { Subscription } from '@/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SubscriptionTable } from '@/components/dashboard/SubscriptionTable';
import { ActionsBar } from '@/components/dashboard/ActionsBar';

export default function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        try {
            const data = await subscriptionService.getAll();
            setSubscriptions(data);
        } catch (err) {
            console.error("Failed to load subscriptions", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (loading) return <DashboardLayout>Loading...</DashboardLayout>;

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">All Subscriptions</h1>
                        <p className="text-slate-500 mt-1">View and manage all your software assets.</p>
                    </div>
                    <ActionsBar />
                </div>

                <SubscriptionTable subscriptions={subscriptions} enableSearch={true} title="Subscriptions Directory" onRefresh={loadData} />
            </div>
        </DashboardLayout>
    );
}
