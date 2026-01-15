'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Settings, Shield, User, Bell, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function SettingsPage() {
    const { isAdmin } = useAuth();

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
                    <p className="text-slate-500 mt-1">Manage your workspace preferences.</p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                    <div className="p-6 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Profile Settings</h3>
                            <p className="text-sm text-slate-500 mt-1">Update your name, email, and avatar.</p>
                            <button className="mt-3 text-sm font-medium text-slate-900 hover:text-indigo-600">Manage Profile &rarr;</button>
                        </div>
                    </div>

                    <div className="p-6 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <Bell className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                            <p className="text-sm text-slate-500 mt-1">Configure email digest and renewal alerts.</p>
                            <button className="mt-3 text-sm font-medium text-slate-900 hover:text-indigo-600">Configure Alerts &rarr;</button>
                        </div>
                    </div>

                    <div className="p-6 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <Shield className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Security & API</h3>
                            <p className="text-sm text-slate-500 mt-1">Manage API keys and integrations.</p>
                            <button className="mt-3 text-sm font-medium text-slate-900 hover:text-indigo-600">View Keys &rarr;</button>
                        </div>
                    </div>
                </div>

                {/* Admin Section */}
                {isAdmin && (
                    <>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Administration</h2>
                            <p className="text-slate-500 mt-1">Manage users and system settings.</p>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                            <div className="p-6 flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                    <Users className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">User Management</h3>
                                    <p className="text-sm text-slate-500 mt-1">View all users and manage their roles and permissions.</p>
                                    <Link href="/settings/users" className="mt-3 text-sm font-medium text-slate-900 hover:text-indigo-600 inline-block">
                                        Manage Users &rarr;
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
