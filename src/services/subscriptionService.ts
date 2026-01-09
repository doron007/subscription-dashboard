import type { Subscription, Transaction } from '@/types';

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
            throw new Error('Failed to create invoice');
        }

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
    }
};
