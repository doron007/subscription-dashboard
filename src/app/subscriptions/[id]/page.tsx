'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscriptionService } from '@/services/subscriptionService';
import { VendorDetailsSection } from '@/components/subscriptions/VendorDetailsSection';
import type { Subscription, BillingCycle, PaymentMethod, Vendor } from '@/types';
import { Loader2, ArrowLeft, Trash2, Box, Calendar, CreditCard, User, AlertCircle, Package, FileText, ListChecks, Users, AlertTriangle, Globe, Mail } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

import Link from 'next/link';
import { TransactionList } from '@/components/subscriptions/TransactionList';
import { ServicesTab } from '@/components/subscriptions/ServicesTab';
import { InvoicesTab } from '@/components/subscriptions/InvoicesTab';
import { LineItemsTab } from '@/components/subscriptions/LineItemsTab';
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal';

export default function SubscriptionDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'services' | 'invoices' | 'lineitems'>('details');

    // Delete handling
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [vendorForm, setVendorForm] = useState<Partial<Vendor>>({}); // Form state for vendor edits

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteType, setDeleteType] = useState<'subscription' | 'vendor'>('subscription');
    const [cascadePreview, setCascadePreview] = useState<any>(undefined);
    const [isDeleting, setIsDeleting] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        category: '',
        cost: 0,
        renewalDate: '',
        billingCycle: 'Annual' as BillingCycle,
        paymentMethod: 'Credit Card' as PaymentMethod,
        paymentDetails: '',
        autoRenewal: true,
        ownerName: '',
        ownerEmail: '',
        status: 'Active',
        seatsTotal: 0,
    });

    useEffect(() => {
        const fetchSubscription = async () => {
            try {
                const sub = await subscriptionService.getById(params.id);

                if (sub.vendorId) {
                    try {
                        const v = await subscriptionService.getVendor(sub.vendorId);

                        // Prefill website from favicon if website is missing
                        if (!v.website && v.logoUrl && v.logoUrl.includes('google.com/s2/favicons')) {
                            try {
                                const urlObj = new URL(v.logoUrl);
                                const domain = urlObj.searchParams.get('domain');
                                if (domain) {
                                    v.website = domain;
                                }
                            } catch (e) {
                                // Ignore URL parsing errors
                            }
                        }

                        setVendor(v);
                        setVendorForm(v); // Initialize form
                    } catch (e) {
                        console.error('Failed to fetch vendor', e);
                    }
                }

                setFormData({
                    name: sub.name || '',
                    category: sub.category || '',
                    cost: sub.cost || 0,
                    renewalDate: sub.renewalDate || '',
                    billingCycle: sub.billingCycle || 'Annual',
                    paymentMethod: sub.paymentMethod || 'Credit Card',
                    paymentDetails: sub.paymentDetails || '',
                    autoRenewal: sub.autoRenewal ?? true,
                    ownerName: sub.owner?.name || '',
                    ownerEmail: sub.owner?.email || '',
                    status: sub.status || 'Active',
                    seatsTotal: sub.seats?.total || 0,
                });
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchSubscription();
    }, [params.id, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload: Partial<Subscription> = {
                name: formData.name,
                category: formData.category,
                cost: Number(formData.cost),
                renewalDate: formData.renewalDate,
                billingCycle: formData.billingCycle,
                paymentMethod: formData.paymentMethod,
                paymentDetails: formData.paymentDetails,
                autoRenewal: formData.autoRenewal,
                owner: {
                    name: formData.ownerName,
                    email: formData.ownerEmail,
                },
                seats: {
                    total: Number(formData.seatsTotal),
                    used: 0, // Backend updates this separately
                },
                status: formData.status as any,
            };


            if (vendor && vendor.id && Object.keys(vendorForm).length > 0) {
                await subscriptionService.updateVendor(vendor.id, vendorForm);
            }

            await subscriptionService.update(params.id, payload);
            router.push('/subscriptions');
            router.refresh();
        } catch (error) {
            alert('Failed to update subscription');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = async (type: 'subscription' | 'vendor') => {
        setDeleteType(type);
        setCascadePreview(undefined);
        setIsDeleting(false);

        if (type === 'vendor') {
            if (!vendor) return;
            try {
                // Check cascade impact
                const res = await subscriptionService.deleteVendor(vendor.id, false);
                if (res.requiresConfirmation) {
                    setCascadePreview(res.impact);
                }
            } catch (error) {
                console.error('Failed to check impact:', error);
            }
        }

        setDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            if (deleteType === 'vendor' && vendor) {
                await subscriptionService.deleteVendor(vendor.id, true);
            } else {
                await subscriptionService.delete(params.id);
            }
            router.push('/subscriptions');
            router.refresh();
        } catch (error) {
            console.error('Failed to delete:', error);
            alert('Failed to delete. Please try again.');
            setIsDeleting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleVendorChange = (field: keyof Vendor, value: string) => {
        setVendorForm(prev => ({ ...prev, [field]: value }));
        // Optimistically update the main vendor object for display
        if (vendor) {
            setVendor({ ...vendor, [field]: value });
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="max-w-5xl mx-auto pb-20">
                {/* Header Actions */}
                <div className="mb-6 flex justify-between items-center">
                    <Link href="/subscriptions" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 transition-colors bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to List
                    </Link>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => handleDeleteClick('subscription')}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                        </button>
                    </div>
                </div>

                <div className="mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{formData.name}</h1>
                            <p className="text-slate-500 text-sm">Manage subscription details and payment history.</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-medium border ${formData.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {formData.status}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-slate-200">
                        <nav className="-mb-px flex space-x-6 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'details'
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                            >
                                <Box className="w-4 h-4" />
                                Details
                            </button>
                            <button
                                onClick={() => setActiveTab('services')}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'services'
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                            >
                                <Package className="w-4 h-4" />
                                Services
                            </button>
                            <button
                                onClick={() => setActiveTab('invoices')}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'invoices'
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                            >
                                <FileText className="w-4 h-4" />
                                Invoices
                            </button>
                            <button
                                onClick={() => setActiveTab('lineitems')}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'lineitems'
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                            >
                                <ListChecks className="w-4 h-4" />
                                Line Items
                            </button>

                        </nav>
                    </div>
                </div>

                {activeTab === 'details' && (
                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        {/* Main Form Area */}
                        <div className="flex-1 w-full space-y-6">

                            <form id="edit-form" onSubmit={handleSubmit} className="space-y-10">

                                {/* Section: Vendor Info */}
                                {vendor && (
                                    <>
                                        <VendorDetailsSection
                                            vendor={vendor}
                                            onChange={handleVendorChange}
                                        />
                                        <hr className="border-slate-100" />
                                    </>
                                )}

                                {/* Section: General */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
                                    <div className="lg:col-span-1">
                                        <h3 className="text-lg font-medium text-slate-900">General Information</h3>
                                        <p className="mt-1 text-sm text-slate-500">Basic details about the application and its categorization.</p>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="col-span-1 md:col-span-2">
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Application Name</label>
                                                <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Category <span className="text-slate-400 font-normal">(optional)</span></label>
                                                <input type="text" name="category" value={formData.category} onChange={handleChange} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. CRM, Security, Productivity" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                                <select name="status" value={formData.status} onChange={handleChange} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                                                    <option value="Active">Active</option>
                                                    <option value="Review">Review (Flagged)</option>
                                                    <option value="Cancelled">Cancelled</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-slate-100" />

                                {/* Section: Plan & Billing */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
                                    <div className="lg:col-span-1">
                                        <h3 className="text-lg font-medium text-slate-900">Billing</h3>
                                        <p className="mt-1 text-sm text-slate-500">Billing cycle and renewal settings.</p>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Billing Cycle</label>
                                                <select name="billingCycle" value={formData.billingCycle} onChange={handleChange as any} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                                                    <option value="Monthly">Monthly</option>
                                                    <option value="Quarterly">Quarterly</option>
                                                    <option value="Annual">Annual</option>
                                                    <option value="As Needed">As Needed</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center">
                                                <div className="flex items-center h-full pt-6">
                                                    <input
                                                        type="checkbox"
                                                        id="autoRenewal"
                                                        checked={formData.autoRenewal}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, autoRenewal: e.target.checked }))}
                                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <label htmlFor="autoRenewal" className="ml-2 text-sm text-slate-700">Auto-renewal enabled</label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-slate-100" />

                                {/* Section: Payment Method */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
                                    <div className="lg:col-span-1">
                                        <h3 className="text-lg font-medium text-slate-900">Payment Details</h3>
                                        <p className="mt-1 text-sm text-slate-500">Payment method and associated account details.</p>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
                                                <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange as any} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                                                    <option value="Credit Card">Credit Card</option>
                                                    <option value="ACH">ACH Transfer</option>
                                                    <option value="Invoice">Invoice</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Details (Last 4 / Notes)</label>
                                                <input type="text" name="paymentDetails" value={formData.paymentDetails} onChange={handleChange} placeholder="e.g. Visa 4242" className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-slate-100" />

                                {/* Section: Ownership */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
                                    <div className="lg:col-span-1">
                                        <h3 className="text-lg font-medium text-slate-900">Ownership</h3>
                                        <p className="mt-1 text-sm text-slate-500">Primary point of contact for this subscription.</p>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name <span className="text-slate-400 font-normal">(optional)</span></label>
                                                <input type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500" placeholder="John Doe" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Owner Email</label>
                                                <input type="email" name="ownerEmail" value={formData.ownerEmail} onChange={handleChange} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500" placeholder="it@downingwell.com" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-slate-100" />

                                {/* Section: Dates */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
                                    <div className="lg:col-span-1">
                                        <h3 className="text-lg font-medium text-slate-900">Important Dates</h3>
                                        <p className="mt-1 text-sm text-slate-500">Next renewal and contract milestones.</p>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Next Renewal Date <span className="text-slate-400 font-normal">(optional)</span></label>
                                                <input type="date" name="renewalDate" value={formData.renewalDate} onChange={handleChange} className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500" />
                                                <p className="mt-1 text-xs text-slate-500">Leave empty for subscriptions with variable renewal schedules</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </form>
                        </div>

                        {/* Sidebar / Actions Area */}
                        <div className="w-full lg:w-80 space-y-6 shrink-0">
                            {/* Save Action */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm sticky top-6">
                                <h3 className="font-semibold text-slate-900 mb-4">Actions</h3>
                                <button
                                    type="submit"
                                    form="edit-form"
                                    disabled={saving}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center disabled:opacity-70"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                                <p className="text-xs text-slate-400 mt-3 text-center">Last updated recently</p>
                            </div>

                            {/* Danger Zone */}
                            <div className="bg-red-50 p-6 rounded-xl border border-red-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-4 text-red-700">
                                    <AlertTriangle className="w-5 h-5" />
                                    <h3 className="font-semibold">Danger Zone</h3>
                                </div>
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteClick('subscription')}
                                        className="w-full py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-medium rounded-lg text-sm transition-colors"
                                    >
                                        Delete Subscription
                                    </button>

                                    {vendor && (
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteClick('vendor')}
                                            className="w-full py-2 bg-red-600 text-white hover:bg-red-700 font-medium rounded-lg text-sm transition-colors"
                                        >
                                            Delete Vendor & All Data
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'services' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <ServicesTab subscriptionId={params.id} />
                    </div>
                )}

                {activeTab === 'invoices' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <InvoicesTab subscriptionId={params.id} />
                    </div>
                )}

                {activeTab === 'lineitems' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <LineItemsTab subscriptionId={params.id} />
                    </div>
                )}


            </div>

            <ConfirmDeleteModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                entityName={deleteType === 'vendor' ? (vendor?.name || 'Vendor') : formData.name}
                entityType={deleteType === 'vendor' ? 'Vendor' : 'Subscription'}
                cascadeImpact={cascadePreview}
                isDeleting={isDeleting}
            />
        </DashboardLayout>
    );
}
