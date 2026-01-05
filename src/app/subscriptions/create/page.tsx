'use client';

import { SubscriptionForm } from '@/components/forms/SubscriptionForm';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CreateSubscriptionPage() {
    return (
        <DashboardLayout>
            <div className="max-w-2xl mx-auto">
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Add New Subscription</h1>
                    <p className="text-slate-500 mt-1">Track a new software or service.</p>
                </div>

                <SubscriptionForm />
            </div>
        </DashboardLayout>
    );
}
