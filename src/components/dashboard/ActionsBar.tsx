'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Download, Upload, Loader2, FileDown } from 'lucide-react';
import Papa from 'papaparse';
import { subscriptionService } from '@/services/subscriptionService';
import { useRouter } from 'next/navigation';
import type { Subscription } from '@/types';

export function ActionsBar() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);

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

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setImporting(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const importedData: Partial<Subscription>[] = results.data.map((row: any) => ({
                        name: row['Name'],
                        category: row['Category'],
                        cost: Number(row['Cost']) || 0,
                        renewalDate: row['Renewal Date'],
                        billingCycle: row['Billing Cycle'] || 'Annual',
                        paymentMethod: row['Payment Method'] || 'Invoice',
                        // Auto-generate logo
                        logo: `https://www.google.com/s2/favicons?domain=${(row['Name'] || '').replace(/\s+/g, '').toLowerCase()}.com&sz=128`,
                        owner: {
                            name: row['Owner Name'] || '',
                            email: row['Owner Email'] || '',
                        },
                        seats: { total: 0, used: 0 },
                        status: 'Active'
                    }));

                    await subscriptionService.bulkCreate(importedData);
                    alert(`Successfully imported ${importedData.length} subscriptions!`);
                    router.refresh(); // Refresh server component
                } catch (error) {
                    console.error(error);
                    alert('Failed to import subscriptions. Please checks your CSV format.');
                } finally {
                    setImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
                }
            },
            error: (error) => {
                console.error(error);
                setImporting(false);
                alert('Error parsing CSV file');
            }
        });
    };

    return (
        <div className="flex gap-3">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv"
                className="hidden"
            />

            <Link href="/sample_import.csv" target="_blank" className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm cursor-pointer flex items-center" title="Download Sample CSV">
                <FileDown className="w-4 h-4 mr-2" />
                Sample
            </Link>

            <button onClick={handleExport} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm cursor-pointer flex items-center">
                <Download className="w-4 h-4 mr-2" />
                Export
            </button>

            <button
                onClick={handleImportClick}
                disabled={importing}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm cursor-pointer flex items-center"
            >
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Import
            </button>

            <Link href="/subscriptions/create" className="px-4 py-2 bg-slate-900 text-slate-50 font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm cursor-pointer flex items-center">
                Add Subscription
            </Link>
        </div>
    );
}
