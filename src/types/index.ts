export type SubscriptionStatus = 'Active' | 'Review' | 'Cancelled';
export type PaymentMethod = 'Credit Card' | 'PO' | 'Invoice' | 'ACH';
export type BillingCycle = 'Monthly' | 'Annual';

export interface LineItem {
    id: string;
    name: string;
    cost: number;
    type?: string; // e.g. "Compute", "License", "Storage"
}

export interface Subscription {
    id: string;
    name: string;
    category: string;
    logo: string; // URL to logo or placeholder
    renewalDate: string; // ISO Date String
    cost: number;
    billingCycle: BillingCycle;
    paymentMethod: PaymentMethod;
    paymentDetails?: string; // e.g., "Visa 4242" or "Account 1234"
    autoRenewal: boolean;
    lineItems?: LineItem[];
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

export interface Employee {
    id: string;
    name: string;
    email: string;
    department?: string;
    jobTitle?: string;
    status: 'Active' | 'Terminated' | 'On Leave';
}

export interface Device {
    id: string;
    name: string;
    serialNumber?: string;
    type: 'Laptop' | 'Mobile' | 'Tablet' | 'Monitor' | 'Other';
    model?: string;
    assignedTo?: string; // Employee ID
}

export interface Assignment {
    id: string;
    subscriptionId: string;
    employeeId?: string;
    deviceId?: string;
    assignedDate: string;
}

export interface Transaction {
    id: string;
    subscriptionId: string;
    date: string; // ISO Date YYYY-MM-DD
    amount: number;
    currency: string;
    status: 'Posted' | 'Pending';
    description: string;
    invoiceUrl?: string;
}
