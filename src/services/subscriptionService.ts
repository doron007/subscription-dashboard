import type { Subscription } from '@/types';

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
    }
};
