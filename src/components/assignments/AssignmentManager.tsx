'use client';

import { useState, useEffect } from 'react';
import type { Subscription, Assignment, Employee, Device } from '@/types';
import { assignmentService } from '@/services/assignmentService';
import { teamService } from '@/services/teamService';
import { deviceService } from '@/services/deviceService';
import { Loader2, Plus, User, Monitor, X, Trash2 } from 'lucide-react';

interface AssignmentManagerProps {
    subscriptionId: string;
    onUpdate?: () => void; // Callback to refresh parent stats
}

export function AssignmentManager({ subscriptionId, onUpdate }: AssignmentManagerProps) {
    const [assignments, setAssignments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Selection State
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedType, setSelectedType] = useState<'Person' | 'Device'>('Person');
    const [selectedEntityId, setSelectedEntityId] = useState('');
    const [assigning, setAssigning] = useState(false);

    const loadData = async () => {
        try {
            const data = await assignmentService.getBySubscription(subscriptionId);
            setAssignments(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [subscriptionId]);

    // Load available entities when modal opens
    useEffect(() => {
        if (showModal) {
            Promise.all([
                teamService.getAll(),
                deviceService.getAll()
            ]).then(([emps, devs]) => {
                setEmployees(emps);
                setDevices(devs);
            });
        }
    }, [showModal]);

    const handleAssign = async () => {
        if (!selectedEntityId) return;
        setAssigning(true);
        try {
            await assignmentService.create({
                subscriptionId,
                employeeId: selectedType === 'Person' ? selectedEntityId : undefined,
                deviceId: selectedType === 'Device' ? selectedEntityId : undefined,
            });
            await loadData();
            setShowModal(false);
            setSelectedEntityId('');
            if (onUpdate) onUpdate();
        } catch (error) {
            alert('Failed to assign');
        } finally {
            setAssigning(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this assignment?')) return;
        try {
            await assignmentService.delete(id);
            await loadData();
            if (onUpdate) onUpdate();
        } catch (error) {
            alert('Failed to delete');
        }
    };

    if (loading) return <div className="py-4 text-center text-slate-400">Loading assignments...</div>;

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Seat Assignments</h3>
                <button
                    onClick={() => setShowModal(true)}
                    className="text-sm bg-slate-50 text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg font-medium border border-slate-200 transition-colors flex items-center"
                >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Assign Seat
                </button>
            </div>

            <div className="divide-y divide-slate-100">
                {assignments.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-sm">
                        No seats assigned yet.
                    </div>
                )}
                {assignments.map((assign) => (
                    <div key={assign.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                {assign.employeeId ? <User className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                            </div>
                            <div>
                                <div className="font-medium text-slate-900">{assign.assigneeName}</div>
                                <div className="text-xs text-slate-500">Assigned {new Date(assign.assignedDate).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <button onClick={() => handleDelete(assign.id)} className="text-slate-400 hover:text-red-500 transition-colors p-2">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-900">Assign Subscription</h3>
                            <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                                <button
                                    onClick={() => setSelectedType('Person')}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${selectedType === 'Person' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Person
                                </button>
                                <button
                                    onClick={() => setSelectedType('Device')}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${selectedType === 'Device' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Device
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Select {selectedType}
                                </label>
                                <select
                                    className="w-full rounded-lg border-slate-200"
                                    value={selectedEntityId}
                                    onChange={(e) => setSelectedEntityId(e.target.value)}
                                >
                                    <option value="">-- Choose --</option>
                                    {selectedType === 'Person' ? (
                                        employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.email})</option>)
                                    ) : (
                                        devices.map(d => <option key={d.id} value={d.id}>{d.name} - {d.model}</option>)
                                    )}
                                </select>
                            </div>

                            <button
                                disabled={!selectedEntityId || assigning}
                                onClick={handleAssign}
                                className="w-full py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                            >
                                {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Assignment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
