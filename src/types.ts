export type SubscriptionStatus = 'Active' | 'Review' | 'Cancelled';
export type PaymentMethod = 'Credit Card' | 'PO' | 'Invoice';
export type BillingCycle = 'Monthly' | 'Annual';

export interface Subscription {
    id: string;
    name: string;
    category: string;
    logo: string; // URL to logo or placeholder
    renewalDate: string; // ISO Date String
    cost: number;
    billingCycle: BillingCycle;
    paymentMethod: PaymentMethod;
    owner: {
        name: string;
        email: string;
        avatarUrl?: string;
    };
    seats: {
        total: number;
        used: number;
    };
    status: SubscriptionStatus;
    description?: string;
}

export interface MetricCardProps {
    label: string;
    value: string | number;
    trend?: {
        value: number; // Percentage
        isPositive: boolean;
    };
    icon?: React.ComponentType<{ className?: string }>;
}
