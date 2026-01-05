'use client';

import { useState, useEffect } from 'react';
import { teamService } from '@/services/teamService';
import type { Employee } from '@/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Plus, Users, Search, Mail, Briefcase } from 'lucide-react';

export default function TeamPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        department: '',
        jobTitle: '',
    });

    const loadData = async () => {
        try {
            const data = await teamService.getAll();
            setEmployees(data);
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
            await teamService.create(formData);
            await loadData(); // Refresh list
            setShowModal(false);
            setFormData({ name: '', email: '', department: '', jobTitle: '' }); // Reset
        } catch (err) {
            alert('Failed to add employee');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    if (loading) {
        return <DashboardLayout><div className="flex justify-center p-12">Loading...</div></DashboardLayout>
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Team Management</h1>
                        <p className="text-slate-500 mt-1">Track employees and their assigned assets.</p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-slate-900 text-slate-50 font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm flex items-center"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Employee
                    </button>
                </div>

                {/* List */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3">Name</th>
                                    <th className="px-6 py-3">Role</th>
                                    <th className="px-6 py-3">Department</th>
                                    <th className="px-6 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                                    {emp.name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-900">{emp.name}</div>
                                                    <div className="text-xs text-slate-500 flex items-center mt-0.5">
                                                        <Mail className="w-3 h-3 mr-1" /> {emp.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-700">{emp.jobTitle}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200">
                                                {emp.department}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                                                {emp.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {employees.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                            No employees found. Add your first team member!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Simple Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-900 mb-4">Add Team Member</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                                <input name="name" required value={formData.name} onChange={handleChange} className="w-full rounded-lg border-slate-200" placeholder="e.g. Sarah Smith" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                                <input name="email" type="email" required value={formData.email} onChange={handleChange} className="w-full rounded-lg border-slate-200" placeholder="sarah@company.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
                                    <input name="jobTitle" required value={formData.jobTitle} onChange={handleChange} className="w-full rounded-lg border-slate-200" placeholder="Engineer" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                                    <input name="department" required value={formData.department} onChange={handleChange} className="w-full rounded-lg border-slate-200" placeholder="Engineering" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 result pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
                                    {isSubmitting ? 'Adding...' : 'Add Member'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
