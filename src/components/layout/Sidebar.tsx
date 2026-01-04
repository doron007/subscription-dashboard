import { LayoutDashboard, CreditCard, PieChart, Settings, LogOut, Code2, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '#', active: true },
    { icon: CreditCard, label: 'Subscriptions', href: '#', active: false },
    { icon: Users, label: 'Team', href: '#', active: false },
    { icon: PieChart, label: 'Reports', href: '#', active: false },
    { icon: Settings, label: 'Settings', href: '#', active: false },
];

export function Sidebar() {
    const [items] = useState(navItems);

    return (
        <aside className="w-64 h-screen bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
            {/* Header */}
            <div className="h-16 flex items-center px-6 border-b border-slate-800">
                <Code2 className="w-6 h-6 text-slate-50 mr-3" />
                <span className="font-semibold text-slate-50 text-lg tracking-tight">SubManager</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-6 space-y-1">
                {items.map((item) => (
                    <a
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
                    </a>
                ))}
            </nav>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-slate-50 font-medium">
                        JD
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-50 truncate">John Doe</p>
                        <p className="text-xs text-slate-400 truncate">VP of IT</p>
                    </div>
                    <button className="text-slate-400 hover:text-slate-50">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
