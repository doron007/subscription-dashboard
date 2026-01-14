'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import Papa from 'papaparse';
import { subscriptionService } from '@/services/subscriptionService';

export function ActionsBar() {
    const handleExport = () => {
        // 1. Fetch current data (or we could pass it in props, but fetching ensures fresh data)
        subscriptionService.getAll().then(data => {
            // 2. Transform to CSV friendly format
            const csvData = data.map(sub => ({
                Name: sub.name,
                Category: sub.category,
                Cost: sub.cost,
                'Renewal Date': sub.renewalDate,
                'Billing Cycle': sub.billingCycle,
                'Payment Method': sub.paymentMethod,
                'Owner Name': sub.owner.name,
                'Owner Email': sub.owner.email,
            }));

            // 3. Generate CSV
            const csv = Papa.unparse(csvData);

            // 4. Download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'subscriptions_export.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    };

    return (
        <div className="flex gap-3">
            <button onClick={handleExport} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm cursor-pointer flex items-center">
                <Download className="w-4 h-4 mr-2" />
                Export
            </button>

            <Link href="/subscriptions/create" className="px-4 py-2 bg-slate-900 text-slate-50 font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm cursor-pointer flex items-center">
                Add Subscription
            </Link>
        </div>
    );
}
