'use client';

import { useState, useEffect } from 'react';
import { deviceService } from '@/services/deviceService';
import type { Device } from '@/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Plus, Monitor, Laptop, Smartphone, Tablet } from 'lucide-react';

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        serialNumber: '',
        type: 'Laptop' as const,
        model: '',
    });

    const loadData = async () => {
        try {
            const data = await deviceService.getAll();
            setDevices(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await deviceService.create(formData);
            await loadData();
            setShowModal(false);
            setFormData({ name: '', serialNumber: '', type: 'Laptop', model: '' });
        } catch (err) {
            alert('Failed to add device');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'Mobile': return Smartphone;
            case 'Tablet': return Tablet;
            case 'Monitor': return Monitor;
            default: return Laptop;
        }
    }

    if (loading) {
        return <DashboardLayout><div className="flex justify-center p-12">Loading...</div></DashboardLayout>
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Device Inventory</h1>
                        <p className="text-slate-500 mt-1">Manage hardware assets and assignments.</p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-slate-900 text-slate-50 font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm flex items-center"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Device
                    </button>
                </div>

                {/* List */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3">Device Name</th>
                                    <th className="px-6 py-3">Type</th>
                                    <th className="px-6 py-3">Model</th>
                                    <th className="px-6 py-3">Serial Number</th>
                                    <th className="px-6 py-3">Assigned To</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {devices.map((dev) => {
                                    const Icon = getIcon(dev.type);
                                    return (
                                        <tr key={dev.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    <div className="font-medium text-slate-900">{dev.name}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-700">{dev.type}</td>
                                            <td className="px-6 py-4 text-slate-700">{dev.model}</td>
                                            <td className="px-6 py-4 text-slate-500 font-mono text-xs">{dev.serialNumber}</td>
                                            <td className="px-6 py-4">
                                                {dev.assignedTo ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                                                        {dev.assignedTo}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Unassigned</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {devices.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                            No devices tracked yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-900 mb-4">Add New Device</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Device Name</label>
                                <input name="name" required value={formData.name} onChange={handleChange} className="w-full rounded-lg border-slate-200" placeholder="e.g. John's MacBook" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                <select name="type" value={formData.type} onChange={handleChange} className="w-full rounded-lg border-slate-200">
                                    <option value="Laptop">Laptop</option>
                                    <option value="Mobile">Mobile</option>
                                    <option value="Tablet">Tablet</option>
                                    <option value="Monitor">Monitor</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
                                    <input name="model" required value={formData.model} onChange={handleChange} className="w-full rounded-lg border-slate-200" placeholder="MacBook Pro" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
                                    <input name="serialNumber" required value={formData.serialNumber} onChange={handleChange} className="w-full rounded-lg border-slate-200" placeholder="C02..." />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
                                    {isSubmitting ? 'Adding...' : 'Add Device'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
