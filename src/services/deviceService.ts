import type { Device } from '@/types';

export const deviceService = {
    getAll: async (): Promise<Device[]> => {
        const response = await fetch('/api/devices', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to fetch devices');
        }
        return response.json();
    },

    create: async (device: Partial<Device>): Promise<Device> => {
        const response = await fetch('/api/devices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(device),
        });

        if (!response.ok) {
            throw new Error('Failed to create device');
        }

        return response.json();
    }
};
