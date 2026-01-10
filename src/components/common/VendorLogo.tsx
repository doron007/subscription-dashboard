import { useState } from 'react';
import { cn } from '@/lib/utils';

// Generate initials from a name (e.g., "Microsoft Azure" -> "MA")
export function getInitials(name: string): string {
    return name
        .split(/\s+/)
        .map(word => word[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

// Generate a consistent color based on the name
const LOGO_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500',
    'bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500',
    'bg-pink-500', 'bg-indigo-500'
];

export function getColorForName(name: string): string {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return LOGO_COLORS[hash % LOGO_COLORS.length];
}

interface VendorLogoProps {
    name: string;
    logo?: string;
    className?: string; // Allow custom sizing/styling
}

export function VendorLogo({ name, logo, className }: VendorLogoProps) {
    const [imgError, setImgError] = useState(false);

    const showInitials = !logo || imgError;

    if (showInitials) {
        return (
            <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm",
                getColorForName(name),
                className
            )}>
                {getInitials(name)}
            </div>
        );
    }

    return (
        <div className={cn("w-10 h-10 rounded-lg border border-slate-200 p-1.5 bg-white flex items-center justify-center", className)}>
            <img
                src={logo}
                alt={name}
                className="w-full h-full object-contain"
                onError={() => setImgError(true)}
            />
        </div>
    );
}
