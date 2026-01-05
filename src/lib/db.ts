import { supabase } from './supabase';
import type { Subscription, SubscriptionStatus, BillingCycle, PaymentMethod, Employee, Device, Assignment } from '../types';

export const db = {
    subscriptions: {
        findAll: async (): Promise<Subscription[]> => {
            const { data, error } = await supabase
                .from('sub_subscriptions')
                .select('*')
                .order('cost', { ascending: false });

            if (error) {
                console.error('Error fetching subscriptions:', error);
                return [];
            }

            // Map DB flat structure to Nested Type structure
            return (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                category: row.category,
                logo: row.logo,
                renewalDate: row.renewal_date, // Map snake_case to camelCase
                cost: row.cost,
                billingCycle: row.billing_cycle as BillingCycle,
                paymentMethod: row.payment_method as PaymentMethod,
                paymentDetails: row.payment_details,
                autoRenewal: row.auto_renewal ?? true, // Default to true if null
                owner: {
                    name: row.owner_name,
                    email: row.owner_email,
                },
                seats: {
                    total: row.seats_total,
                    used: row.seats_used,
                },
                status: row.status as SubscriptionStatus,
            }));
        },
        create: async (sub: Partial<Subscription>): Promise<Subscription | null> => {
            const dbPayload = {
                name: sub.name,
                category: sub.category,
                logo: sub.logo,
                renewal_date: sub.renewalDate,
                cost: sub.cost,
                billing_cycle: sub.billingCycle,
                payment_method: sub.paymentMethod,
                payment_details: sub.paymentDetails,
                auto_renewal: sub.autoRenewal ?? true,
                owner_name: sub.owner?.name,
                owner_email: sub.owner?.email,
                seats_total: sub.seats?.total || 0,
                seats_used: sub.seats?.used || 0,
                status: sub.status || 'Active',
            };

            const { data, error } = await supabase
                .from('sub_subscriptions')
                .insert(dbPayload)
                .select()
                .single();

            if (error) {
                console.error('Error creating subscription:', error);
                throw error;
            }

            // Map back to App Type
            return {
                id: data.id,
                name: data.name,
                category: data.category,
                logo: data.logo,
                renewalDate: data.renewal_date,
                cost: data.cost,
                billingCycle: data.billing_cycle as BillingCycle,
                paymentMethod: data.payment_method as PaymentMethod,
                paymentDetails: data.payment_details,
                autoRenewal: data.auto_renewal,
                owner: {
                    name: data.owner_name,
                    email: data.owner_email,
                },
                seats: {
                    total: data.seats_total,
                    used: data.seats_used,
                },
                status: data.status as SubscriptionStatus,
            };
        },

        createMany: async (subs: Partial<Subscription>[]): Promise<boolean> => {
            const dbPayloads = subs.map(sub => ({
                name: sub.name,
                category: sub.category,
                logo: sub.logo,
                renewal_date: sub.renewalDate,
                cost: sub.cost,
                billing_cycle: sub.billingCycle,
                payment_method: sub.paymentMethod,
                payment_details: sub.paymentDetails,
                auto_renewal: sub.autoRenewal ?? true,
                owner_name: sub.owner?.name,
                owner_email: sub.owner?.email,
                seats_total: sub.seats?.total || 0,
                seats_used: sub.seats?.used || 0,
                status: sub.status || 'Active',
            }));

            const { error } = await supabase
                .from('sub_subscriptions')
                .insert(dbPayloads);

            if (error) {
                console.error('Error bulk creating subscriptions:', error);
                return false;
            }
            return true;
        },

        findById: async (id: string): Promise<Subscription | null> => {
            const { data, error } = await supabase
                .from('sub_subscriptions')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error('Error finding subscription:', error);
                return null;
            }

            return {
                id: data.id,
                name: data.name,
                category: data.category,
                logo: data.logo,
                renewalDate: data.renewal_date,
                cost: data.cost,
                billingCycle: data.billing_cycle as BillingCycle,
                paymentMethod: data.payment_method as PaymentMethod,
                paymentDetails: data.payment_details,
                autoRenewal: data.auto_renewal,
                owner: {
                    name: data.owner_name,
                    email: data.owner_email,
                },
                seats: {
                    total: data.seats_total,
                    used: data.seats_used,
                },
                status: data.status as SubscriptionStatus,
            };
        },

        update: async (id: string, sub: Partial<Subscription>): Promise<Subscription | null> => {
            const dbPayload: any = {};
            if (sub.name) dbPayload.name = sub.name;
            if (sub.category) dbPayload.category = sub.category;
            if (sub.logo) dbPayload.logo = sub.logo;
            if (sub.renewalDate) dbPayload.renewal_date = sub.renewalDate;
            if (sub.cost !== undefined) dbPayload.cost = sub.cost;
            if (sub.billingCycle) dbPayload.billing_cycle = sub.billingCycle;
            if (sub.paymentMethod) dbPayload.payment_method = sub.paymentMethod;
            if (sub.paymentDetails !== undefined) dbPayload.payment_details = sub.paymentDetails;
            if (sub.autoRenewal !== undefined) dbPayload.auto_renewal = sub.autoRenewal;
            // Handle nested updates carefully - typically valid because form sends full object
            if (sub.owner?.name) dbPayload.owner_name = sub.owner.name;
            if (sub.owner?.email) dbPayload.owner_email = sub.owner.email;
            if (sub.status) dbPayload.status = sub.status;

            const { data, error } = await supabase
                .from('sub_subscriptions')
                .update(dbPayload)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error('Error updating subscription:', error);
                throw error;
            }

            return {
                id: data.id,
                name: data.name,
                category: data.category,
                logo: data.logo,
                renewalDate: data.renewal_date,
                cost: data.cost,
                billingCycle: data.billing_cycle as BillingCycle,
                paymentMethod: data.payment_method as PaymentMethod,
                paymentDetails: data.payment_details,
                autoRenewal: data.auto_renewal,
                owner: {
                    name: data.owner_name,
                    email: data.owner_email,
                },
                seats: {
                    total: data.seats_total,
                    used: data.seats_used,
                },
                status: data.status as SubscriptionStatus,
            };
        },

        delete: async (id: string): Promise<boolean> => {
            const { error } = await supabase
                .from('sub_subscriptions')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting subscription:', error);
                return false;
            }
            return true;
        }
    },
    employees: {
        findAll: async (): Promise<Employee[]> => {
            const { data, error } = await supabase
                .from('sub_employees')
                .select('*')
                .order('name', { ascending: true });

            if (error) {
                console.error('Error fetching employees:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                email: row.email,
                department: row.department,
                jobTitle: row.job_title,
                status: row.status,
            }));
        },

        create: async (emp: Partial<Employee>): Promise<Employee | null> => {
            const { data, error } = await supabase
                .from('sub_employees')
                .insert({
                    name: emp.name,
                    email: emp.email,
                    department: emp.department,
                    job_title: emp.jobTitle,
                    status: emp.status || 'Active',
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating employee:', error);
                throw error;
            }

            return {
                id: data.id,
                name: data.name,
                email: data.email,
                department: data.department,
                jobTitle: data.job_title,
                status: data.status,
            };
        }
    },
    devices: {
        findAll: async (): Promise<Device[]> => {
            const { data, error } = await supabase
                .from('sub_devices')
                .select(`
                    *,
                    assigned_to_user:sub_employees(name)
                `)
                .order('name', { ascending: true });

            if (error) {
                console.error('Error fetching devices:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                serialNumber: row.serial_number,
                type: row.type,
                model: row.model,
                assignedTo: row.assigned_to_user?.name || null, // For display simplified
            }));
        },

        create: async (device: Partial<Device>): Promise<Device | null> => {
            const { data, error } = await supabase
                .from('sub_devices')
                .insert({
                    name: device.name,
                    serial_number: device.serialNumber,
                    type: device.type,
                    model: device.model,
                    // assigned_to: device.assignedTo // impl later with assignment logic
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating device:', error);
                throw error;
            }

            return {
                id: data.id,
                name: data.name,
                serialNumber: data.serial_number,
                type: data.type,
                model: data.model,
            };
        }
    },
    assignments: {
        findBySubscription: async (subId: string): Promise<Assignment[]> => {
            const { data, error } = await supabase
                .from('sub_assignments')
                .select(`
                    *,
                    employee:sub_employees(name),
                    device:sub_devices(name)
                `)
                .eq('subscription_id', subId)
                .order('assigned_date', { ascending: false });

            if (error) {
                console.error('Error fetching assignments:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                subscriptionId: row.subscription_id,
                employeeId: row.employee_id,
                deviceId: row.device_id,
                assignedDate: row.assigned_date,
                // These are extra fields for UI display, not strict to valid Assignment type but helpful.
                // We might need to extend the type or just use 'any' cast in UI for now.
                assigneeName: row.employee?.name || row.device?.name || 'Unknown'
            }));
        },

        create: async (assignment: Partial<Assignment>): Promise<Assignment | null> => {
            const { data, error } = await supabase
                .from('sub_assignments')
                .insert({
                    subscription_id: assignment.subscriptionId,
                    employee_id: assignment.employeeId || null,
                    device_id: assignment.deviceId || null
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return {
                id: data.id,
                subscriptionId: data.subscription_id,
                employeeId: data.employee_id,
                deviceId: data.device_id,
                assignedDate: data.assigned_date
            };
        },

        delete: async (id: string): Promise<boolean> => {
            const { error } = await supabase
                .from('sub_assignments')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting assignment:', error);
                return false;
            }
            return true;
        }
    }
}
