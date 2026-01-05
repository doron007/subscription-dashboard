'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { subscriptionService } from '@/services/subscriptionService';
import { LineItemsEditor } from '@/components/forms/LineItemsEditor';
import type { Subscription, BillingCycle, PaymentMethod, LineItem } from '@/types';
import { Loader2 } from 'lucide-react';

export function SubscriptionForm() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        cost: 0,
        renewalDate: '',
        billingCycle: 'Annual' as BillingCycle,
        paymentMethod: 'Credit Card' as PaymentMethod,
        paymentDetails: '',
        autoRenewal: true,
        lineItems: [] as LineItem[],
        ownerName: '',
        ownerEmail: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Basic validation handled by HTML required attributes for now
            const payload: Partial<Subscription> = {
                name: formData.name,
                category: formData.category,
                cost: Number(formData.cost),
                renewalDate: formData.renewalDate,
                billingCycle: formData.billingCycle,
                paymentMethod: formData.paymentMethod,
                paymentDetails: formData.paymentDetails,
                autoRenewal: formData.autoRenewal,
                lineItems: formData.lineItems,
                // Using Google Favicons for automated logo
                logo: `https://www.google.com/s2/favicons?domain=${formData.name.replace(/\s+/g, '').toLowerCase()}.com&sz=128`,
                owner: {
                    name: formData.ownerName,
                    email: formData.ownerEmail,
                },
                seats: {
                    total: 0,
                    used: 0,
                },
                status: 'Active',
            };

            await subscriptionService.create(payload);
            router.push('/'); // Redirect to dashboard
            router.refresh(); // Ensure data is re-fetched
        } catch (error) {
            alert('Failed to create subscription');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Name */}
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Application Name*</label>
                    <input
                        type="text" name="name" required
                        value={formData.name} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                        placeholder="e.g. Salesforce"
                    />
                </div>

                {/* Category */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                    <input
                        type="text" name="category" required
                        value={formData.category} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                        placeholder="e.g. CRM"
                    />
                </div>

                {/* Cost */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cost</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                        <input
                            type="number" name="cost" required min="0"
                            value={formData.cost} onChange={handleChange}
                            className="w-full pl-7 rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                        />
                    </div>
                </div>

                {/* Billing Cycle */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Billing Cycle</label>
                    <select
                        name="billingCycle"
                        value={formData.billingCycle} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                    >
                        <option value="Annual">Annual</option>
                        <option value="Monthly">Monthly</option>
                    </select>
                </div>

                {/* Renewal Date */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Next Renewal</label>
                    <input
                        type="date" name="renewalDate" required
                        value={formData.renewalDate} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                    />
                    <div className="mt-2 flex items-center">
                        <input
                            type="checkbox"
                            id="autoRenewal"
                            name="autoRenewal"
                            checked={formData.autoRenewal}
                            onChange={(e) => setFormData(prev => ({ ...prev, autoRenewal: e.target.checked }))}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        />
                        <label htmlFor="autoRenewal" className="ml-2 text-sm text-slate-600">Auto Renewal Enabled</label>
                    </div>
                </div>

                {/* Payment Method */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                    <select
                        name="paymentMethod"
                        value={formData.paymentMethod} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                    >
                        <option value="Credit Card">Credit Card</option>
                        <option value="ACH">ACH (Bank Transfer)</option>
                        <option value="Invoice">Invoice</option>
                        <option value="PO">PO</option>
                    </select>
                </div>

                {/* Payment Details */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Details</label>
                    <input
                        type="text" name="paymentDetails"
                        value={formData.paymentDetails} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                        placeholder="e.g. Visa 4242, Account 1234"
                    />
                </div>

                {/* Line Items */}
                <div className="col-span-1 md:col-span-2 pt-4 border-t border-slate-100">
                    <LineItemsEditor
                        items={formData.lineItems}
                        onChange={(items) => setFormData(prev => ({ ...prev, lineItems: items }))}
                    />
                </div>

                {/* Owner Name (Temporary) */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name</label>
                    <input
                        type="text" name="ownerName" required
                        value={formData.ownerName} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                        placeholder="John Doe"
                    />
                </div>
                {/* Owner Email (Temporary) */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Owner Email</label>
                    <input
                        type="email" name="ownerEmail" required
                        value={formData.ownerEmail} onChange={handleChange}
                        className="w-full rounded-lg border-slate-200 focus:border-slate-500 focus:ring-slate-500"
                        placeholder="john@company.com"
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center min-w-[100px] justify-center"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Subscription'}
                </button>
            </div>
        </form>
    );
}
