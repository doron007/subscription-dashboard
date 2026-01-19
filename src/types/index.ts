export type SubscriptionStatus = 'Active' | 'Review' | 'Cancelled';
export type PaymentMethod = 'Credit Card' | 'PO' | 'Invoice' | 'ACH';
export type BillingCycle = 'Monthly' | 'Annual' | 'Quarterly' | 'As Needed';

export interface Employee {
    id: string;
    name: string;
    email: string;
    department?: string;
    jobTitle?: string;
    status?: string;
    avatarUrl?: string;
}

export interface Device {
    id: string;
    name: string;
    type: string;
    model?: string;
    serialNumber?: string;
    assignedTo?: string;
}

export interface Assignment {
    id: string;
    subscriptionId: string;
    employeeId?: string;
    deviceId?: string;
    assignedDate?: string;
    assigneeName?: string;
}

// --- Phase 6: New Data Model Entities ---

export interface Vendor {
    id: string;
    name: string;
    website?: string;
    contactEmail?: string;
    logoUrl?: string;
    category?: string; // AI-populated vendor category
}

export interface SubscriptionService {
    id: string;
    subscriptionId: string;
    name: string; // e.g. "Office 365 E3"
    category?: string;
    status: 'Active' | 'Inactive';
    currentQuantity?: number;
    currentUnitPrice?: number;
    currency: string;
}

export interface Invoice {
    id: string;
    vendorId: string;
    subscriptionId?: string; // Optional link to specific agreement
    invoiceNumber?: string;
    invoiceDate: string; // ISO Date
    dueDate?: string;
    totalAmount: number;
    currency: string;
    status: 'Paid' | 'Pending' | 'Overdue';
    fileUrl?: string;
    lineItems?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
    id: string;
    invoiceId: string;
    serviceId?: string; // Link to "Catalog" item
    description: string;
    quantity?: number;
    unitPrice?: number;
    totalAmount: number;
    periodStart?: string;
    periodEnd?: string;
    billingMonthOverride?: string; // Manual override for service month from CSV
}

// ----------------------------------------

export interface LineItem {
    id: string;
    name: string;
    cost: number;
    type?: string;
}

export interface Subscription {
    id: string;
    vendorId?: string; // New Link
    name: string; // Agreement Name
    category: string;
    logo: string;
    renewalDate: string;
    cost: number;
    billingCycle: BillingCycle;
    paymentMethod: PaymentMethod;
    paymentDetails?: string;
    autoRenewal: boolean;

    // Legacy / Convenience fields
    lineItems?: LineItem[];

    // New Hierarchy Link
    services?: SubscriptionService[];

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
        value: number;
        isPositive: boolean;
    };
    icon?: React.ComponentType<{ className?: string }>;
    subtext?: string;
}


export interface Transaction {
    id: string;
    subscriptionId: string;
    invoiceId?: string; // New Link
    date: string;
    amount: number;
    currency: string;
    status: 'Posted' | 'Pending';
    description: string;
    invoiceUrl?: string;
}
