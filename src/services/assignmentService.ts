import type { Assignment } from '@/types';

export const assignmentService = {
    getBySubscription: async (subId: string): Promise<Assignment[]> => {
        const response = await fetch(`/api/assignments?subscriptionId=${subId}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to fetch assignments');
        }
        return response.json();
    },

    create: async (assignment: Partial<Assignment>): Promise<Assignment> => {
        const response = await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(assignment),
        });

        if (!response.ok) {
            throw new Error('Failed to assign seat');
        }

        return response.json();
    },

    delete: async (id: string): Promise<void> => {
        const response = await fetch(`/api/assignments?id=${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to remove assignment');
        }
    }
};
