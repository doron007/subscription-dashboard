'use client';

import { LayoutDashboard, CreditCard, PieChart, Settings, LogOut, Code2, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/', active: false },
    { icon: CreditCard, label: 'Subscriptions', href: '/subscriptions', active: false },
    { icon: Sparkles, label: 'Shadow Detector', href: '/shadow-it', active: false },
    { icon: PieChart, label: 'Reports', href: '/reports', active: false },
    { icon: Settings, label: 'Settings', href: '/settings', active: false },
];

const adminNavItems = [
    { icon: Users, label: 'User Management', href: '/settings/users', active: false },
];

export function Sidebar() {
    const [items] = useState(navItems);
    const { profile, signOut, isLoading, isAdmin } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push('/login');
    };

    // Get initials from full name or email
    const getInitials = () => {
        if (profile?.full_name) {
            return profile.full_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
        }
        if (profile?.email) {
            return profile.email[0].toUpperCase();
        }
        return '?';
    };

    // Get display name
    const getDisplayName = () => {
        return profile?.full_name || profile?.email?.split('@')[0] || 'User';
    };

    // Get role display
    const getRoleDisplay = () => {
        if (!profile?.role) return '';
        const roleLabels: Record<string, string> = {
            user: 'User',
            admin: 'Admin',
            super_admin: 'Super Admin',
        };
        return roleLabels[profile.role] || profile.role;
    };

    return (
        <aside className="w-64 h-screen bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 fixed left-0 top-0">
            {/* Header */}
            <div className="h-16 flex items-center px-6 border-b border-slate-800">
                <Code2 className="w-6 h-6 text-slate-50 mr-3" />
                <span className="font-semibold text-slate-50 text-lg tracking-tight">SubManager</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                {items.map((item) => (
                    <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                            "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                            item.active
                                ? "bg-slate-800 text-slate-50 shadow-sm"
                                : "hover:bg-slate-800/50 hover:text-slate-100"
                        )}
                    >
                        <item.icon className={cn("w-5 h-5 mr-3", item.active ? "text-slate-50" : "text-slate-400")} />
                        {item.label}
                    </Link>
                ))}

                {/* Admin Section */}
                {isAdmin && (
                    <>
                        <div className="pt-4 pb-2 px-3">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</span>
                        </div>
                        {adminNavItems.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={cn(
                                    "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                                    item.active
                                        ? "bg-slate-800 text-slate-50 shadow-sm"
                                        : "hover:bg-slate-800/50 hover:text-slate-100"
                                )}
                            >
                                <item.icon className={cn("w-5 h-5 mr-3", item.active ? "text-slate-50" : "text-slate-400")} />
                                {item.label}
                            </Link>
                        ))}
                    </>
                )}
            </nav>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-slate-50 font-medium text-sm">
                        {isLoading ? '...' : getInitials()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-50 truncate">
                            {isLoading ? 'Loading...' : getDisplayName()}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                            {isLoading ? '' : getRoleDisplay()}
                        </p>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="text-slate-400 hover:text-slate-50 transition-colors"
                        title="Sign out"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
