import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { MetricCardProps } from '../../types';

export function StatsCard({ label, value, trend, icon: Icon }: MetricCardProps) {
    return (
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-clean flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{value}</h3>

                {trend && (
                    <div className="flex items-center mt-2 text-sm">
                        <span className={cn(
                            "flex items-center font-medium",
                            trend.isPositive ? "text-emerald-600" : "text-rose-600"
                        )}>
                            {trend.isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                            {Math.abs(trend.value)}%
                        </span>
                        <span className="text-slate-400 ml-2">vs last month</span>
                    </div>
                )}
            </div>

            {Icon && (
                <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                    <Icon className="w-6 h-6" />
                </div>
            )}
        </div>
    );
}
