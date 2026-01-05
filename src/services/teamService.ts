import type { Employee } from '@/types';

export const teamService = {
    getAll: async (): Promise<Employee[]> => {
        const response = await fetch('/api/team', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to fetch employees');
        }
        return response.json();
    },

    create: async (employee: Partial<Employee>): Promise<Employee> => {
        const response = await fetch('/api/team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(employee),
        });

        if (!response.ok) {
            throw new Error('Failed to create employee');
        }

        return response.json();
    }
};
