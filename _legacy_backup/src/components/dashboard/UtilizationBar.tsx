import { cn } from '../../lib/utils';

interface UtilizationBarProps {
    total: number;
    used: number;
    className?: string;
}

export function UtilizationBar({ total, used, className }: UtilizationBarProps) {
    if (total === 0) return <span className="text-sm text-slate-400">Consumption Based</span>;

    const percentage = Math.min(Math.round((used / total) * 100), 100);

    // Color logic:
    // < 70% : Warning (Underutilized) - Slate/Yellow mix ? Actually let's stick to Slate/Orange for "Alert"
    // > 90% : Good (Effective) - Slate 800
    // But usually high utilization is good, over 100% is bad.
    // Let's keep it monochromatic:
    // Slate-800 for filled.

    return (
        <div className={cn("w-full max-w-[140px]", className)}>
            <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">{percentage}%</span>
                <span className="text-slate-400">{used}/{total}</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all duration-500",
                        percentage > 90 ? "bg-slate-900" : "bg-slate-500"
                    )}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
