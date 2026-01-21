import type { Subscription, Transaction } from '@/types';

// Session cache for reports with 5-minute TTL
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class SessionCache<T> {
    private cache = new Map<string, CacheEntry<T>>();

    get(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    set(key: string, data: T): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clear(): void {
        this.cache.clear();
    }
}

const reportCache = new SessionCache<any>();

export const subscriptionService = {
    getAll: async (): Promise<Subscription[]> => {
        const response = await fetch('/api/subscriptions', { cache: 'no-store' }); // Ensure fresh data
        if (!response.ok) {
            throw new Error('Failed to fetch subscriptions');
        }
        return response.json();
    },

    create: async (subscription: Partial<Subscription>): Promise<Subscription> => {
        const response = await fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription),
        });

        if (!response.ok) {
            throw new Error('Failed to create subscription');
        }

        return response.json();
    },

    bulkCreate: async (subscriptions: Partial<Subscription>[]): Promise<void> => {
        const response = await fetch('/api/subscriptions/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscriptions),
        });

        if (!response.ok) {
            throw new Error('Failed to import subscriptions');
        }
    },

    getById: async (id: string): Promise<Subscription> => {
        const response = await fetch(`/api/subscriptions/${id}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to fetch subscription');
        }
        return response.json();
    },

    update: async (id: string, subscription: Partial<Subscription>): Promise<Subscription> => {
        const response = await fetch(`/api/subscriptions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription),
        });

        if (!response.ok) {
            throw new Error('Failed to update subscription');
        }

        return response.json();
    },

    delete: async (id: string): Promise<void> => {
        const response = await fetch(`/api/subscriptions/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete subscription');
        }
    },

    addTransaction: async (transaction: Omit<Transaction, 'id'>): Promise<Transaction> => {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction),
        });

        if (!response.ok) {
            throw new Error('Failed to create transaction');
        }

        return response.json();
    },

    createInvoice: async (analysis: any): Promise<any> => {
        const response = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analysis }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Invoice API error:', errorData);
            throw new Error(`Failed to create invoice: ${errorData.details || errorData.error || response.statusText}`);
        }

        return response.json();
    },

    updateInvoice: async (id: string, data: any): Promise<any> => {
        const response = await fetch(`/api/invoices/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Failed to update invoice');
        return response.json();
    },

    // --- Phase 6: New Methods ---

    getVendors: async () => {
        const response = await fetch('/api/vendors', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch vendors');
        return response.json();
    },

    getVendor: async (id: string) => {
        const response = await fetch(`/api/vendors/${id}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch vendor');
        return response.json();
    },

    getInvoices: async (subscriptionId?: string) => {
        const url = subscriptionId
            ? `/api/subscriptions/${subscriptionId}/invoices`
            : '/api/invoices';
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch invoices');
        return response.json();
    },

    getServices: async (subscriptionId: string) => {
        const response = await fetch(`/api/subscriptions/${subscriptionId}/services`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch services');
        return response.json();
    },

    getLineItems: async (subscriptionId: string) => {
        const response = await fetch(`/api/subscriptions/${subscriptionId}/line-items`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch line items');
        return response.json();
    },

    getInvoiceLineItems: async (invoiceId: string) => {
        const response = await fetch(`/api/invoices/${invoiceId}/line-items`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch invoice line items');
        return response.json();
    },

    getAllLineItems: async () => {
        const response = await fetch('/api/line-items', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch line items');
        return response.json();
    },

    // Vendors
    updateVendor: async (id: string, data: any) => {
        const response = await fetch(`/api/vendors/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Failed to update vendor');
        return response.json();
    },

    deleteVendor: async (id: string, confirm = false) => {
        const response = await fetch(`/api/vendors/${id}?confirm=${confirm}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete vendor');
        return response.json();
    },

    // Services
    updateService: async (id: string, data: any) => {
        const response = await fetch(`/api/services/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Failed to update service');
        return response.json();
    },

    deleteService: async (id: string, confirm = false) => {
        const response = await fetch(`/api/services/${id}?confirm=${confirm}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete service');
        return response.json();
    },

    // Line Items
    createLineItem: async (data: any) => {
        const response = await fetch('/api/line-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Failed to create line item');
        return response.json();
    },

    updateLineItem: async (id: string, data: any) => {
        const response = await fetch(`/api/line-items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Failed to update line item');
        return response.json();
    },

    deleteLineItem: async (id: string) => {
        const response = await fetch(`/api/line-items/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete line item');
        return response.json();
    },

    // Reports - Server-side aggregated data with session caching
    getAggregatedReport: async (params: {
        startDate: string;
        endDate: string;
        groupBy: 'vendor' | 'service';
    }) => {
        const cacheKey = `report_${params.startDate}_${params.endDate}_${params.groupBy}`;

        // Check session cache
        const cached = reportCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const searchParams = new URLSearchParams({
            startDate: params.startDate,
            endDate: params.endDate,
            groupBy: params.groupBy
        });
        const response = await fetch(`/api/reports/aggregated?${searchParams}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch aggregated report');

        const data = await response.json();

        // Store in session cache
        reportCache.set(cacheKey, data);

        return data;
    },

    // Invalidate report cache (call after data changes)
    invalidateReportCache: () => {
        reportCache.clear();
    }
};
