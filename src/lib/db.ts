import { createClient } from './supabase/client';
import type { Subscription, SubscriptionStatus, BillingCycle, PaymentMethod, Employee, Device, Assignment, Vendor, SubscriptionService, Invoice, InvoiceLineItem } from '../types';
import { normalizeForMatching } from './import/parseCSV';

// Create a singleton instance for client-side usage
const supabase = createClient();

export const db = {
    // --- Phase 6: New Entities ---

    vendors: {
        findByName: async (name: string): Promise<Vendor | null> => {
            const { data, error } = await supabase
                .from('sub_vendors')
                .select('*')
                .ilike('name', name)
                .single();

            if (error) return null;
            return {
                id: data.id,
                name: data.name,
                website: data.website,
                contactEmail: data.contact_email,
                logoUrl: data.logo_url,
                category: data.category
            };
        },

        create: async (vendor: Partial<Vendor>): Promise<Vendor> => {
            const { data, error } = await supabase
                .from('sub_vendors')
                .insert({
                    name: vendor.name,
                    website: vendor.website,
                    contact_email: vendor.contactEmail,
                    logo_url: vendor.logoUrl,
                    category: vendor.category
                })
                .select()
                .single();

            if (error) throw error;
            return {
                id: data.id,
                name: data.name,
                website: data.website,
                contactEmail: data.contact_email,
                logoUrl: data.logo_url,
                category: data.category
            };
        },

        // Batch find vendors by names (for large imports)
        findByNames: async (names: string[]): Promise<Map<string, Vendor>> => {
            if (names.length === 0) return new Map();

            const { data, error } = await supabase
                .from('sub_vendors')
                .select('*');

            if (error) {
                console.error('Error batch finding vendors:', error);
                return new Map();
            }

            // Create a case-insensitive lookup map
            const result = new Map<string, Vendor>();
            for (const row of data || []) {
                const vendor: Vendor = {
                    id: row.id,
                    name: row.name,
                    website: row.website,
                    contactEmail: row.contact_email,
                    logoUrl: row.logo_url,
                    category: row.category
                };
                // Match by lowercase name
                result.set(row.name.toLowerCase(), vendor);
            }
            return result;
        },

        findAll: async (): Promise<(Vendor & { subscriptionCount: number; invoiceCount: number; totalSpend: number })[]> => {
            // Fetch vendors
            const { data: vendorData, error: vendorError } = await supabase
                .from('sub_vendors')
                .select('*')
                .order('name', { ascending: true });

            if (vendorError) {
                console.error('Error fetching vendors:', vendorError);
                return [];
            }

            // For each vendor, get counts and spend
            const vendorsWithStats = await Promise.all((vendorData || []).map(async (row: any) => {
                // Get subscription count
                const { count: subCount } = await supabase
                    .from('sub_subscriptions')
                    .select('*', { count: 'exact', head: true })
                    .eq('vendor_id', row.id);

                // Get invoices with amounts
                const { data: invoices } = await supabase
                    .from('sub_invoices')
                    .select('total_amount')
                    .eq('vendor_id', row.id);

                const invoiceCount = invoices?.length || 0;
                const totalSpend = (invoices || []).reduce((sum: number, inv: any) =>
                    sum + (parseFloat(inv.total_amount) || 0), 0);

                return {
                    id: row.id,
                    name: row.name,
                    website: row.website,
                    contactEmail: row.contact_email,
                    logoUrl: row.logo_url,
                    category: row.category,
                    subscriptionCount: subCount || 0,
                    invoiceCount,
                    totalSpend
                };
            }));

            return vendorsWithStats;
        },

        findById: async (id: string): Promise<Vendor | null> => {
            const { data, error } = await supabase
                .from('sub_vendors')
                .select('*')
                .eq('id', id)
                .single();

            if (error) return null;
            return {
                id: data.id,
                name: data.name,
                website: data.website,
                contactEmail: data.contact_email,
                logoUrl: data.logo_url,
                category: data.category
            };
        },

        update: async (id: string, vendor: Partial<Vendor>): Promise<Vendor | null> => {
            // Only include fields that are explicitly provided
            const updatePayload: Record<string, any> = {
                updated_at: new Date().toISOString()
            };
            if (vendor.name !== undefined) updatePayload.name = vendor.name;
            if (vendor.website !== undefined) updatePayload.website = vendor.website;
            if (vendor.contactEmail !== undefined) updatePayload.contact_email = vendor.contactEmail;
            if (vendor.logoUrl !== undefined) updatePayload.logo_url = vendor.logoUrl;
            if (vendor.category !== undefined) updatePayload.category = vendor.category;

            const { data, error } = await supabase
                .from('sub_vendors')
                .update(updatePayload)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error('Error updating vendor:', error);
                return null;
            }
            return {
                id: data.id,
                name: data.name,
                website: data.website,
                contactEmail: data.contact_email,
                logoUrl: data.logo_url,
                category: data.category
            };
        },

        // Cascade delete: removes all subscriptions, services, invoices, line items
        delete: async (id: string): Promise<{ success: boolean; deletedCounts: { subscriptions: number; services: number; invoices: number; lineItems: number } }> => {
            // Get all subscriptions for this vendor to cascade delete
            const { data: subscriptions } = await supabase
                .from('sub_subscriptions')
                .select('id')
                .eq('vendor_id', id);

            const subIds = subscriptions?.map(s => s.id) || [];
            let deletedServices = 0;
            let deletedInvoices = 0;
            let deletedLineItems = 0;

            if (subIds.length > 0) {
                // 1. Get services FIRST - need their IDs to delete line items by service_id
                const { data: services, count: svcCount } = await supabase
                    .from('sub_subscription_services')
                    .select('id', { count: 'exact' })
                    .in('subscription_id', subIds);
                deletedServices = svcCount || 0;
                const serviceIds = services?.map(s => s.id) || [];

                // 2. Delete line items by service_id FIRST (critical - avoids FK violation)
                if (serviceIds.length > 0) {
                    const { count: liByServiceCount } = await supabase
                        .from('sub_invoice_line_items')
                        .select('*', { count: 'exact', head: true })
                        .in('service_id', serviceIds);
                    deletedLineItems = liByServiceCount || 0;

                    await supabase
                        .from('sub_invoice_line_items')
                        .delete()
                        .in('service_id', serviceIds);
                }

                // 3. Get invoices and delete any remaining line items by invoice_id
                const { data: invoices, count: invCount } = await supabase
                    .from('sub_invoices')
                    .select('id', { count: 'exact' })
                    .in('subscription_id', subIds);
                deletedInvoices = invCount || 0;
                const invoiceIds = invoices?.map(i => i.id) || [];

                if (invoiceIds.length > 0) {
                    // Delete any remaining line items by invoice_id
                    await supabase
                        .from('sub_invoice_line_items')
                        .delete()
                        .in('invoice_id', invoiceIds);

                    // 4. Delete invoices
                    await supabase
                        .from('sub_invoices')
                        .delete()
                        .in('id', invoiceIds);
                }

                // 5. Delete services (now safe - no line items reference them)
                if (serviceIds.length > 0) {
                    await supabase
                        .from('sub_subscription_services')
                        .delete()
                        .in('id', serviceIds);
                }

                // 6. Delete assignments
                await supabase
                    .from('sub_assignments')
                    .delete()
                    .in('subscription_id', subIds);

                // 7. Delete subscriptions
                await supabase
                    .from('sub_subscriptions')
                    .delete()
                    .in('id', subIds);
            }

            // 8. Finally delete the vendor
            const { error } = await supabase
                .from('sub_vendors')
                .delete()
                .eq('id', id);

            return {
                success: !error,
                deletedCounts: {
                    subscriptions: subIds.length,
                    services: deletedServices,
                    invoices: deletedInvoices,
                    lineItems: deletedLineItems
                }
            };
        },

        // Get cascade impact before delete (for UI warning)
        getCascadeImpact: async (id: string): Promise<{ subscriptions: number; services: number; invoices: number; lineItems: number }> => {
            const { data: subscriptions } = await supabase
                .from('sub_subscriptions')
                .select('id')
                .eq('vendor_id', id);

            const subIds = subscriptions?.map(s => s.id) || [];
            let services = 0;
            let invoices = 0;
            let lineItems = 0;

            if (subIds.length > 0) {
                const { count: svcCount } = await supabase
                    .from('sub_subscription_services')
                    .select('*', { count: 'exact', head: true })
                    .in('subscription_id', subIds);
                services = svcCount || 0;

                const { data: invData, count: invCount } = await supabase
                    .from('sub_invoices')
                    .select('id', { count: 'exact' })
                    .in('subscription_id', subIds);
                invoices = invCount || 0;

                const invoiceIds = invData?.map(i => i.id) || [];
                if (invoiceIds.length > 0) {
                    const { count: liCount } = await supabase
                        .from('sub_invoice_line_items')
                        .select('*', { count: 'exact', head: true })
                        .in('invoice_id', invoiceIds);
                    lineItems = liCount || 0;
                }
            }

            return { subscriptions: subIds.length, services, invoices, lineItems };
        },

        // Get merge preview - count entities that will be moved
        getMergePreview: async (sourceVendorId: string): Promise<{
            subscriptions: number;
            invoices: number;
            services: number;
            lineItems: number;
        }> => {
            // Count subscriptions
            const { count: subCount } = await supabase
                .from('sub_subscriptions')
                .select('*', { count: 'exact', head: true })
                .eq('vendor_id', sourceVendorId);

            // Count invoices
            const { count: invCount } = await supabase
                .from('sub_invoices')
                .select('*', { count: 'exact', head: true })
                .eq('vendor_id', sourceVendorId);

            // Get subscription IDs for service count
            const { data: subs } = await supabase
                .from('sub_subscriptions')
                .select('id')
                .eq('vendor_id', sourceVendorId);

            const subIds = (subs || []).map(s => s.id);
            let svcCount = 0;

            if (subIds.length > 0) {
                const { count } = await supabase
                    .from('sub_subscription_services')
                    .select('*', { count: 'exact', head: true })
                    .in('subscription_id', subIds);
                svcCount = count || 0;
            }

            // Line items via invoices
            const { data: invoices } = await supabase
                .from('sub_invoices')
                .select('id')
                .eq('vendor_id', sourceVendorId);

            const invIds = (invoices || []).map(i => i.id);
            let liCount = 0;

            if (invIds.length > 0) {
                const { count } = await supabase
                    .from('sub_invoice_line_items')
                    .select('*', { count: 'exact', head: true })
                    .in('invoice_id', invIds);
                liCount = count || 0;
            }

            return {
                subscriptions: subCount || 0,
                invoices: invCount || 0,
                services: svcCount,
                lineItems: liCount
            };
        },

        // Merge source vendor into target vendor
        merge: async (
            sourceVendorId: string,
            targetVendorId: string,
            newName?: string
        ): Promise<{ success: boolean; merged: { subscriptions: number; invoices: number; services: number }; error?: string }> => {
            try {
                console.log(`[Vendor Merge] Starting merge: ${sourceVendorId} -> ${targetVendorId}`);

                // 1. Optionally rename target vendor
                if (newName) {
                    const { error: renameError } = await supabase
                        .from('sub_vendors')
                        .update({ name: newName, updated_at: new Date().toISOString() })
                        .eq('id', targetVendorId);
                    if (renameError) {
                        console.error('[Vendor Merge] Failed to rename target vendor:', renameError);
                    }
                }

                // 2. Get target vendor's subscription (or create one if needed)
                let targetSubscription = await db.subscriptions.findLatestByVendor(targetVendorId);

                if (!targetSubscription) {
                    // Get target vendor name for subscription
                    const targetVendor = await db.vendors.findById(targetVendorId);
                    if (!targetVendor) {
                        throw new Error('Target vendor not found');
                    }

                    targetSubscription = await db.subscriptions.create({
                        vendorId: targetVendorId,
                        name: `${targetVendor.name} Master Agreement`,
                        status: 'Active',
                        billingCycle: 'Monthly',
                        paymentMethod: 'Invoice',
                        logo: targetVendor.logoUrl
                    });

                    if (!targetSubscription) {
                        throw new Error('Failed to create target subscription');
                    }
                    console.log(`[Vendor Merge] Created new target subscription: ${targetSubscription.id}`);
                }

                // 3. Get all source subscriptions
                const { data: sourceSubscriptions, error: srcSubError } = await supabase
                    .from('sub_subscriptions')
                    .select('id')
                    .eq('vendor_id', sourceVendorId);

                if (srcSubError) {
                    console.error('[Vendor Merge] Failed to get source subscriptions:', srcSubError);
                }

                const sourceSubIds = (sourceSubscriptions || []).map(s => s.id);
                console.log(`[Vendor Merge] Found ${sourceSubIds.length} source subscriptions`);

                // 4. Move invoices from source vendor to target vendor AND target subscription
                const { count: invoiceCount } = await supabase
                    .from('sub_invoices')
                    .select('*', { count: 'exact', head: true })
                    .eq('vendor_id', sourceVendorId);

                console.log(`[Vendor Merge] Moving ${invoiceCount || 0} invoices`);

                const { error: invoiceMoveError } = await supabase
                    .from('sub_invoices')
                    .update({
                        vendor_id: targetVendorId,
                        subscription_id: targetSubscription.id
                    })
                    .eq('vendor_id', sourceVendorId);

                if (invoiceMoveError) {
                    console.error('[Vendor Merge] Failed to move invoices:', invoiceMoveError);
                    throw new Error(`Failed to move invoices: ${invoiceMoveError.message}`);
                }

                // Verify invoices moved
                const { count: remainingInvoices } = await supabase
                    .from('sub_invoices')
                    .select('*', { count: 'exact', head: true })
                    .eq('vendor_id', sourceVendorId);

                if (remainingInvoices && remainingInvoices > 0) {
                    console.error(`[Vendor Merge] ${remainingInvoices} invoices still on source vendor after move!`);
                }

                // 5. Reassign services to target subscription
                let serviceCount = 0;
                if (sourceSubIds.length > 0) {
                    // Count services before moving
                    const { count } = await supabase
                        .from('sub_subscription_services')
                        .select('*', { count: 'exact', head: true })
                        .in('subscription_id', sourceSubIds);
                    serviceCount = count || 0;
                    console.log(`[Vendor Merge] Moving ${serviceCount} services`);

                    // Move services
                    const { error: serviceMoveError } = await supabase
                        .from('sub_subscription_services')
                        .update({
                            subscription_id: targetSubscription.id,
                            updated_at: new Date().toISOString()
                        })
                        .in('subscription_id', sourceSubIds);

                    if (serviceMoveError) {
                        console.error('[Vendor Merge] Failed to move services:', serviceMoveError);
                    }

                    // 6. Delete assignments from source subscriptions
                    const { error: assignmentDeleteError } = await supabase
                        .from('sub_assignments')
                        .delete()
                        .in('subscription_id', sourceSubIds);

                    if (assignmentDeleteError) {
                        console.error('[Vendor Merge] Failed to delete assignments:', assignmentDeleteError);
                    }

                    // 7. Delete source subscriptions by their IDs directly (more reliable)
                    console.log(`[Vendor Merge] Deleting source subscriptions: ${sourceSubIds.join(', ')}`);
                    const { error: subDeleteError } = await supabase
                        .from('sub_subscriptions')
                        .delete()
                        .in('id', sourceSubIds);

                    if (subDeleteError) {
                        console.error('[Vendor Merge] Failed to delete source subscriptions:', subDeleteError);
                        throw new Error(`Failed to delete source subscriptions: ${subDeleteError.message}`);
                    }

                    // Verify subscriptions deleted
                    const { count: remainingSubs } = await supabase
                        .from('sub_subscriptions')
                        .select('*', { count: 'exact', head: true })
                        .eq('vendor_id', sourceVendorId);

                    if (remainingSubs && remainingSubs > 0) {
                        console.error(`[Vendor Merge] ${remainingSubs} subscriptions still on source vendor after delete!`);
                    }
                }

                // 8. Delete source vendor
                console.log(`[Vendor Merge] Deleting source vendor: ${sourceVendorId}`);
                const { error: vendorDeleteError } = await supabase
                    .from('sub_vendors')
                    .delete()
                    .eq('id', sourceVendorId);

                if (vendorDeleteError) {
                    console.error('[Vendor Merge] Failed to delete source vendor:', vendorDeleteError);
                    throw new Error(`Failed to delete source vendor: ${vendorDeleteError.message}`);
                }

                // Verify vendor deleted
                const { data: checkVendor } = await supabase
                    .from('sub_vendors')
                    .select('id')
                    .eq('id', sourceVendorId)
                    .maybeSingle();

                if (checkVendor) {
                    console.error('[Vendor Merge] Source vendor still exists after delete!');
                    return {
                        success: false,
                        merged: { subscriptions: 0, invoices: 0, services: 0 },
                        error: 'Source vendor could not be deleted'
                    };
                }

                console.log(`[Vendor Merge] Merge completed successfully`);
                return {
                    success: true,
                    merged: {
                        subscriptions: sourceSubIds.length,
                        invoices: invoiceCount || 0,
                        services: serviceCount
                    }
                };
            } catch (error) {
                console.error('[Vendor Merge] Error:', error);
                return {
                    success: false,
                    merged: { subscriptions: 0, invoices: 0, services: 0 },
                    error: (error as Error).message
                };
            }
        }
    },

    services: {
        findBySubscription: async (subId: string): Promise<SubscriptionService[]> => {
            const { data, error } = await supabase
                .from('sub_subscription_services')
                .select('*')
                .eq('subscription_id', subId);

            if (error) return [];
            return data.map((row: any) => ({
                id: row.id,
                subscriptionId: row.subscription_id,
                name: row.name,
                category: row.category,
                status: row.status,
                currentQuantity: row.current_quantity,
                currentUnitPrice: row.current_unit_price,
                currency: row.currency
            }));
        },

        upsert: async (service: Partial<SubscriptionService>, invoiceDate?: Date): Promise<SubscriptionService> => {
            // Find-or-Create pattern with fuzzy matching for service names
            // First, get all services for this subscription to do fuzzy matching
            const { data: existingServices } = await supabase
                .from('sub_subscription_services')
                .select('*')
                .eq('subscription_id', service.subscriptionId);

            // Find best match using normalized comparison
            const normalizedNewName = normalizeForMatching(service.name || '');
            let existing = null;

            if (existingServices && existingServices.length > 0) {
                // First try exact match (case-insensitive)
                existing = existingServices.find(s =>
                    normalizeForMatching(s.name) === normalizedNewName
                );

                // If no exact match, try fuzzy matching for very close names
                if (!existing && normalizedNewName) {
                    existing = existingServices.find(s => {
                        const existingNormalized = normalizeForMatching(s.name);
                        // Check if one contains the other (handles slight variations)
                        return existingNormalized === normalizedNewName ||
                            (existingNormalized.length > 10 && normalizedNewName.length > 10 &&
                                (existingNormalized.includes(normalizedNewName) ||
                                    normalizedNewName.includes(existingNormalized)));
                    });
                }
            }

            if (existing) {
                // Only update if this invoice is more recent than the service's last update
                const existingUpdatedAt = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                const shouldUpdate = !invoiceDate || invoiceDate >= existingUpdatedAt;

                if (shouldUpdate) {
                    const { data, error } = await supabase
                        .from('sub_subscription_services')
                        .update({
                            current_quantity: service.currentQuantity,
                            current_unit_price: service.currentUnitPrice,
                            currency: service.currency,
                            // Use invoice date as the updated_at to track which invoice the data came from
                            updated_at: invoiceDate ? invoiceDate.toISOString() : new Date().toISOString()
                        })
                        .eq('id', existing.id)
                        .select()
                        .single();

                    if (error) throw error;
                    return {
                        id: data.id,
                        subscriptionId: data.subscription_id,
                        name: data.name,
                        category: data.category,
                        status: data.status,
                        currentQuantity: data.current_quantity,
                        currentUnitPrice: data.current_unit_price,
                        currency: data.currency
                    };
                } else {
                    // Return existing without updating (invoice is older)
                    console.log(`[Services] Skipping update for ${service.name} - invoice date ${invoiceDate} is older than existing ${existingUpdatedAt}`);
                    return {
                        id: existing.id,
                        subscriptionId: existing.subscription_id,
                        name: existing.name,
                        category: existing.category,
                        status: existing.status,
                        currentQuantity: existing.current_quantity,
                        currentUnitPrice: existing.current_unit_price,
                        currency: existing.currency
                    };
                }
            }

            // Create new service
            const { data, error } = await supabase
                .from('sub_subscription_services')
                .insert({
                    subscription_id: service.subscriptionId,
                    name: service.name,
                    category: service.category,
                    status: service.status || 'Active',
                    current_quantity: service.currentQuantity,
                    current_unit_price: service.currentUnitPrice,
                    currency: service.currency,
                    // Set updated_at to invoice date so we can compare later
                    updated_at: invoiceDate ? invoiceDate.toISOString() : new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return {
                id: data.id,
                subscriptionId: data.subscription_id,
                name: data.name,
                category: data.category,
                status: data.status,
                currentQuantity: data.current_quantity,
                currentUnitPrice: data.current_unit_price,
                currency: data.currency
            };
        },

        // Batch upsert for large imports - drastically reduces DB round-trips
        batchUpsert: async (
            services: Array<{
                subscriptionId: string;
                name: string;
                currentQuantity: number;
                currentUnitPrice: number;
                currency: string;
            }>,
            invoiceDate: Date
        ): Promise<Map<string, string>> => {
            // Returns Map<serviceName, serviceId>
            if (services.length === 0) return new Map();

            // 1. Get unique subscription IDs
            const subscriptionIds = [...new Set(services.map(s => s.subscriptionId))];

            // 2. ONE query to fetch ALL existing services for these subscriptions
            const { data: existingServices, error: fetchError } = await supabase
                .from('sub_subscription_services')
                .select('*')
                .in('subscription_id', subscriptionIds);

            if (fetchError) {
                console.error('Error batch fetching services:', fetchError);
                throw fetchError;
            }

            // 3. Build lookup map: key = subscriptionId|normalizedName
            const existingMap = new Map<string, any>();
            for (const svc of existingServices || []) {
                const key = `${svc.subscription_id}|${normalizeForMatching(svc.name)}`;
                existingMap.set(key, svc);
            }

            // 4. Categorize into inserts vs updates, tracking results
            const toInsert: Array<{
                subscription_id: string;
                name: string;
                current_quantity: number;
                current_unit_price: number;
                currency: string;
                status: string;
                updated_at: string;
            }> = [];
            const toUpdate: Array<{ id: string; data: any }> = [];
            const resultMap = new Map<string, string>();
            const invoiceDateStr = invoiceDate.toISOString();

            // Deduplicate services by subscriptionId + normalizedName to avoid duplicate inserts
            const processedKeys = new Set<string>();

            for (const service of services) {
                const normalizedName = normalizeForMatching(service.name);
                const key = `${service.subscriptionId}|${normalizedName}`;

                // Skip if we've already processed this service in this batch
                if (processedKeys.has(key)) {
                    // Still need to add to result map with existing ID
                    const existingId = resultMap.get(service.name);
                    if (existingId) continue;
                }
                processedKeys.add(key);

                const existing = existingMap.get(key);

                if (existing) {
                    const existingUpdatedAt = new Date(existing.updated_at || 0);
                    if (invoiceDate >= existingUpdatedAt) {
                        toUpdate.push({
                            id: existing.id,
                            data: {
                                current_quantity: service.currentQuantity,
                                current_unit_price: service.currentUnitPrice,
                                updated_at: invoiceDateStr
                            }
                        });
                    }
                    resultMap.set(service.name, existing.id);
                } else {
                    toInsert.push({
                        subscription_id: service.subscriptionId,
                        name: service.name,
                        current_quantity: service.currentQuantity,
                        current_unit_price: service.currentUnitPrice,
                        currency: service.currency,
                        status: 'Active',
                        updated_at: invoiceDateStr
                    });
                }
            }

            // 5. Bulk insert new services (1 query)
            if (toInsert.length > 0) {
                const { data: inserted, error: insertError } = await supabase
                    .from('sub_subscription_services')
                    .insert(toInsert)
                    .select('id, name');

                if (insertError) {
                    console.error('Error bulk inserting services:', insertError);
                    throw insertError;
                }

                for (const svc of inserted || []) {
                    resultMap.set(svc.name, svc.id);
                }
            }

            // 6. Update existing services
            // Supabase doesn't support bulk updates, but updates are typically fewer than inserts
            // and the main gain is from the single fetch + bulk insert
            for (const item of toUpdate) {
                await supabase
                    .from('sub_subscription_services')
                    .update(item.data)
                    .eq('id', item.id);
            }

            return resultMap;
        },

        findById: async (id: string): Promise<SubscriptionService | null> => {
            const { data, error } = await supabase
                .from('sub_subscription_services')
                .select('*')
                .eq('id', id)
                .single();

            if (error) return null;
            return {
                id: data.id,
                subscriptionId: data.subscription_id,
                name: data.name,
                category: data.category,
                status: data.status,
                currentQuantity: data.current_quantity,
                currentUnitPrice: data.current_unit_price,
                currency: data.currency
            };
        },

        update: async (id: string, service: Partial<SubscriptionService>): Promise<SubscriptionService | null> => {
            const { data, error } = await supabase
                .from('sub_subscription_services')
                .update({
                    name: service.name,
                    category: service.category,
                    status: service.status,
                    current_quantity: service.currentQuantity,
                    current_unit_price: service.currentUnitPrice,
                    currency: service.currency,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) return null;
            return {
                id: data.id,
                subscriptionId: data.subscription_id,
                name: data.name,
                category: data.category,
                status: data.status,
                currentQuantity: data.current_quantity,
                currentUnitPrice: data.current_unit_price,
                currency: data.currency
            };
        },

        // Cascade delete: removes related line items
        delete: async (id: string): Promise<{ success: boolean; deletedLineItems: number }> => {
            // Count line items first
            const { data: lineItems } = await supabase
                .from('sub_invoice_line_items')
                .select('id')
                .eq('service_id', id);

            const deletedLineItems = lineItems?.length || 0;

            // Delete line items
            if (deletedLineItems > 0) {
                await supabase
                    .from('sub_invoice_line_items')
                    .delete()
                    .eq('service_id', id);
            }

            // Delete the service
            const { error } = await supabase
                .from('sub_subscription_services')
                .delete()
                .eq('id', id);

            return { success: !error, deletedLineItems };
        },

        getCascadeImpact: async (id: string): Promise<{ lineItems: number }> => {
            const { data } = await supabase
                .from('sub_invoice_line_items')
                .select('id')
                .eq('service_id', id);

            return { lineItems: data?.length || 0 };
        },

        // Delete all services for a subscription (used when reprocessing invoices)
        deleteBySubscription: async (subscriptionId: string): Promise<number> => {
            // First get all service IDs for this subscription
            const { data: services } = await supabase
                .from('sub_subscription_services')
                .select('id')
                .eq('subscription_id', subscriptionId);

            if (!services || services.length === 0) return 0;

            const serviceIds = services.map(s => s.id);

            // Delete line items referencing these services
            await supabase
                .from('sub_invoice_line_items')
                .delete()
                .in('service_id', serviceIds);

            // Delete the services
            const { error } = await supabase
                .from('sub_subscription_services')
                .delete()
                .eq('subscription_id', subscriptionId);

            if (error) {
                console.error('Error deleting services:', error);
                return 0;
            }

            return services.length;
        },

        // Get merge preview - count line items that will be moved
        getMergePreview: async (sourceServiceId: string): Promise<{
            lineItems: number;
            totalAmount: number;
        }> => {
            const { data: lineItems, error } = await supabase
                .from('sub_invoice_line_items')
                .select('amount')
                .eq('service_id', sourceServiceId);

            if (error) {
                console.error('[Service Merge Preview] Error:', error);
                return { lineItems: 0, totalAmount: 0 };
            }

            const totalAmount = (lineItems || []).reduce((sum, li) =>
                sum + (parseFloat(li.amount) || 0), 0);

            return {
                lineItems: lineItems?.length || 0,
                totalAmount
            };
        },

        // Merge source service into target service (move all line items)
        merge: async (
            sourceServiceId: string,
            targetServiceId: string
        ): Promise<{ success: boolean; movedLineItems: number; error?: string }> => {
            try {
                console.log(`[Service Merge] Starting merge: ${sourceServiceId} -> ${targetServiceId}`);

                // 1. Count line items before moving
                const { count: lineItemCount } = await supabase
                    .from('sub_invoice_line_items')
                    .select('*', { count: 'exact', head: true })
                    .eq('service_id', sourceServiceId);

                console.log(`[Service Merge] Moving ${lineItemCount || 0} line items`);

                // 2. Move line items from source service to target service
                if (lineItemCount && lineItemCount > 0) {
                    const { error: moveError } = await supabase
                        .from('sub_invoice_line_items')
                        .update({
                            service_id: targetServiceId
                        })
                        .eq('service_id', sourceServiceId);

                    if (moveError) {
                        console.error('[Service Merge] Failed to move line items:', moveError);
                        throw new Error(`Failed to move line items: ${moveError.message}`);
                    }

                    // Verify line items moved
                    const { count: remainingItems } = await supabase
                        .from('sub_invoice_line_items')
                        .select('*', { count: 'exact', head: true })
                        .eq('service_id', sourceServiceId);

                    if (remainingItems && remainingItems > 0) {
                        console.error(`[Service Merge] ${remainingItems} line items still on source service after move!`);
                        return {
                            success: false,
                            movedLineItems: 0,
                            error: 'Some line items could not be moved'
                        };
                    }
                }

                // 3. Delete source service (now empty)
                console.log(`[Service Merge] Deleting source service: ${sourceServiceId}`);
                const { error: deleteError } = await supabase
                    .from('sub_subscription_services')
                    .delete()
                    .eq('id', sourceServiceId);

                if (deleteError) {
                    console.error('[Service Merge] Failed to delete source service:', deleteError);
                    throw new Error(`Failed to delete source service: ${deleteError.message}`);
                }

                // Verify service deleted
                const { data: checkService } = await supabase
                    .from('sub_subscription_services')
                    .select('id')
                    .eq('id', sourceServiceId)
                    .maybeSingle();

                if (checkService) {
                    console.error('[Service Merge] Source service still exists after delete!');
                    return {
                        success: false,
                        movedLineItems: 0,
                        error: 'Source service could not be deleted'
                    };
                }

                console.log(`[Service Merge] Merge completed successfully`);
                return {
                    success: true,
                    movedLineItems: lineItemCount || 0
                };
            } catch (error) {
                console.error('[Service Merge] Error:', error);
                return {
                    success: false,
                    movedLineItems: 0,
                    error: (error as Error).message
                };
            }
        }
    },

    invoices: {
        create: async (invoice: Partial<Invoice>): Promise<Invoice> => {
            const { data, error } = await supabase
                .from('sub_invoices')
                .insert({
                    vendor_id: invoice.vendorId,
                    subscription_id: invoice.subscriptionId,
                    invoice_number: invoice.invoiceNumber,
                    invoice_date: invoice.invoiceDate,
                    due_date: invoice.dueDate,
                    total_amount: invoice.totalAmount,
                    currency: invoice.currency || 'USD',
                    status: invoice.status || 'Pending',
                    file_url: invoice.fileUrl
                })
                .select()
                .single();

            if (error) throw error;
            return {
                id: data.id,
                vendorId: data.vendor_id,
                subscriptionId: data.subscription_id,
                invoiceNumber: data.invoice_number,
                invoiceDate: data.invoice_date,
                dueDate: data.due_date,
                totalAmount: data.total_amount,
                currency: data.currency,
                status: data.status,
                fileUrl: data.file_url
            };
        },

        addLineItems: async (items: Partial<InvoiceLineItem>[]): Promise<void> => {
            const dbItems = items.map(item => ({
                invoice_id: item.invoiceId,
                service_id: item.serviceId,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                total_amount: item.totalAmount,
                period_start: item.periodStart,
                period_end: item.periodEnd,
                billing_month_override: item.billingMonthOverride
            }));

            const { error } = await supabase
                .from('sub_invoice_line_items')
                .insert(dbItems);

            if (error) throw error;
        },

        // Find invoice by invoice number (for idempotency check)
        findByNumber: async (invoiceNumber: string): Promise<Invoice | null> => {
            const { data, error } = await supabase
                .from('sub_invoices')
                .select('*')
                .eq('invoice_number', invoiceNumber)
                .maybeSingle();

            if (error) {
                console.error('Error finding invoice by number:', error);
                return null;
            }
            if (!data) return null;

            return {
                id: data.id,
                vendorId: data.vendor_id,
                subscriptionId: data.subscription_id,
                invoiceNumber: data.invoice_number,
                invoiceDate: data.invoice_date,
                dueDate: data.due_date,
                totalAmount: data.total_amount,
                currency: data.currency,
                status: data.status,
                fileUrl: data.file_url
            };
        },

        // Batch find invoices by invoice numbers (for large imports)
        findByNumbers: async (invoiceNumbers: string[]): Promise<Map<string, Invoice>> => {
            if (invoiceNumbers.length === 0) return new Map();

            const { data, error } = await supabase
                .from('sub_invoices')
                .select('*')
                .in('invoice_number', invoiceNumbers);

            if (error) {
                console.error('Error batch finding invoices:', error);
                return new Map();
            }

            const result = new Map<string, Invoice>();
            for (const row of data || []) {
                result.set(row.invoice_number, {
                    id: row.id,
                    vendorId: row.vendor_id,
                    subscriptionId: row.subscription_id,
                    invoiceNumber: row.invoice_number,
                    invoiceDate: row.invoice_date,
                    dueDate: row.due_date,
                    totalAmount: row.total_amount,
                    currency: row.currency,
                    status: row.status,
                    fileUrl: row.file_url
                });
            }
            return result;
        },

        // Batch get line items for multiple invoices (for large imports)
        getLineItemsByInvoiceIds: async (invoiceIds: string[]): Promise<Map<string, InvoiceLineItem[]>> => {
            if (invoiceIds.length === 0) return new Map();

            const { data, error } = await supabase
                .from('sub_invoice_line_items')
                .select('*')
                .in('invoice_id', invoiceIds);

            if (error) {
                console.error('Error batch getting line items:', error);
                return new Map();
            }

            const result = new Map<string, InvoiceLineItem[]>();
            for (const row of data || []) {
                const item: InvoiceLineItem = {
                    id: row.id,
                    invoiceId: row.invoice_id,
                    serviceId: row.service_id,
                    description: row.description,
                    quantity: row.quantity,
                    unitPrice: row.unit_price,
                    totalAmount: row.total_amount,
                    periodStart: row.period_start,
                    periodEnd: row.period_end,
                    billingMonthOverride: row.billing_month_override
                };
                if (!result.has(row.invoice_id)) {
                    result.set(row.invoice_id, []);
                }
                result.get(row.invoice_id)!.push(item);
            }
            return result;
        },

        // Delete line items for an invoice (for re-processing)
        deleteLineItems: async (invoiceId: string): Promise<void> => {
            const { error } = await supabase
                .from('sub_invoice_line_items')
                .delete()
                .eq('invoice_id', invoiceId);

            if (error) throw error;
        },

        // Update existing invoice
        update: async (id: string, invoice: Partial<Invoice>): Promise<Invoice> => {
            // Only include fields that are explicitly provided
            const updatePayload: Record<string, any> = {};
            if (invoice.invoiceDate !== undefined) updatePayload.invoice_date = invoice.invoiceDate;
            if (invoice.totalAmount !== undefined) updatePayload.total_amount = invoice.totalAmount;
            if (invoice.currency !== undefined) updatePayload.currency = invoice.currency;
            if (invoice.status !== undefined) updatePayload.status = invoice.status;
            if (invoice.dueDate !== undefined) updatePayload.due_date = invoice.dueDate;

            const { data, error } = await supabase
                .from('sub_invoices')
                .update(updatePayload)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error('Error updating invoice:', error);
                throw error;
            }
            return {
                id: data.id,
                vendorId: data.vendor_id,
                subscriptionId: data.subscription_id,
                invoiceNumber: data.invoice_number,
                invoiceDate: data.invoice_date,
                dueDate: data.due_date,
                totalAmount: data.total_amount,
                currency: data.currency,
                status: data.status,
                fileUrl: data.file_url
            };
        },

        delete: async (id: string): Promise<{ success: boolean; deletedCounts: { lineItems: number } }> => {
            // 1. Delete associated line items
            const { count: lineItemCount } = await supabase
                .from('sub_invoice_line_items')
                .select('*', { count: 'exact', head: true })
                .eq('invoice_id', id);

            const { error: lineItemsError } = await supabase
                .from('sub_invoice_line_items')
                .delete()
                .eq('invoice_id', id);

            if (lineItemsError) throw lineItemsError;

            // 2. Delete the invoice
            const { error: invoiceError } = await supabase
                .from('sub_invoices')
                .delete()
                .eq('id', id);

            if (invoiceError) throw invoiceError;

            return {
                success: true,
                deletedCounts: {
                    lineItems: lineItemCount || 0
                }
            };
        },

        findAll: async (): Promise<Invoice[]> => {
            const { data, error } = await supabase
                .from('sub_invoices')
                .select(`
                    *,
                    vendor:sub_vendors(name)
                `)
                .order('invoice_date', { ascending: false });

            if (error) {
                console.error('Error fetching invoices:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                vendorId: row.vendor_id,
                subscriptionId: row.subscription_id,
                invoiceNumber: row.invoice_number,
                invoiceDate: row.invoice_date,
                dueDate: row.due_date,
                totalAmount: parseFloat(row.total_amount) || 0,
                currency: row.currency,
                status: row.status,
                fileUrl: row.file_url,
                vendorName: row.vendor?.name
            }));
        },

        findBySubscription: async (subscriptionId: string): Promise<Invoice[]> => {
            const { data, error } = await supabase
                .from('sub_invoices')
                .select('*')
                .eq('subscription_id', subscriptionId)
                .order('invoice_date', { ascending: false });

            if (error) {
                console.error('Error fetching invoices by subscription:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                vendorId: row.vendor_id,
                subscriptionId: row.subscription_id,
                invoiceNumber: row.invoice_number,
                invoiceDate: row.invoice_date,
                dueDate: row.due_date,
                totalAmount: parseFloat(row.total_amount) || 0,
                currency: row.currency,
                status: row.status,
                fileUrl: row.file_url
            }));
        },

        findByVendor: async (vendorId: string): Promise<Invoice[]> => {
            const { data, error } = await supabase
                .from('sub_invoices')
                .select('*')
                .eq('vendor_id', vendorId)
                .order('invoice_date', { ascending: false });

            if (error) {
                console.error('Error fetching invoices by vendor:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                vendorId: row.vendor_id,
                subscriptionId: row.subscription_id,
                invoiceNumber: row.invoice_number,
                invoiceDate: row.invoice_date,
                dueDate: row.due_date,
                totalAmount: parseFloat(row.total_amount) || 0,
                currency: row.currency,
                status: row.status,
                fileUrl: row.file_url
            }));
        },

        getLineItems: async (invoiceId: string): Promise<InvoiceLineItem[]> => {
            const { data, error } = await supabase
                .from('sub_invoice_line_items')
                .select(`
                    *,
                    service:sub_subscription_services(name)
                `)
                .eq('invoice_id', invoiceId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching line items:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                invoiceId: row.invoice_id,
                serviceId: row.service_id,
                description: row.description,
                quantity: parseFloat(row.quantity) || 0,
                unitPrice: parseFloat(row.unit_price) || 0,
                totalAmount: parseFloat(row.total_amount) || 0,
                periodStart: row.period_start,
                periodEnd: row.period_end,
                serviceName: row.service?.name
            }));
        },

        getAllLineItemsBySubscription: async (subscriptionId: string): Promise<(InvoiceLineItem & { invoiceNumber?: string; invoiceDate?: string })[]> => {
            const { data, error } = await supabase
                .from('sub_invoice_line_items')
                .select(`
                    *,
                    service:sub_subscription_services(name),
                    invoice:sub_invoices!inner(invoice_number, invoice_date, subscription_id)
                `)
                .eq('invoice.subscription_id', subscriptionId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching all line items by subscription:', error);
                return [];
            }

            return (data || []).map((row: any) => ({
                id: row.id,
                invoiceId: row.invoice_id,
                serviceId: row.service_id,
                description: row.description,
                quantity: parseFloat(row.quantity) || 0,
                unitPrice: parseFloat(row.unit_price) || 0,
                totalAmount: parseFloat(row.total_amount) || 0,
                periodStart: row.period_start,
                periodEnd: row.period_end,
                serviceName: row.service?.name,
                invoiceNumber: row.invoice?.invoice_number,
                invoiceDate: row.invoice?.invoice_date
            }));
        }
    },

    // --- Line Items CRUD ---
    lineItems: {
        findById: async (id: string): Promise<InvoiceLineItem | null> => {
            const { data, error } = await supabase
                .from('sub_invoice_line_items')
                .select(`
                    *,
                    service:sub_subscription_services(name),
                    invoice:sub_invoices(invoice_number, invoice_date)
                `)
                .eq('id', id)
                .single();

            if (error) return null;
            return {
                id: data.id,
                invoiceId: data.invoice_id,
                serviceId: data.service_id,
                description: data.description,
                quantity: parseFloat(data.quantity) || 0,
                unitPrice: parseFloat(data.unit_price) || 0,
                totalAmount: parseFloat(data.total_amount) || 0,
                periodStart: data.period_start,
                periodEnd: data.period_end
            };
        },

        create: async (item: Partial<InvoiceLineItem>): Promise<InvoiceLineItem | null> => {
            const { data, error } = await supabase
                .from('sub_invoice_line_items')
                .insert({
                    invoice_id: item.invoiceId,
                    service_id: item.serviceId,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    total_amount: item.totalAmount,
                    period_start: item.periodStart,
                    period_end: item.periodEnd
                })
                .select()
                .single();

            if (error) return null;
            return {
                id: data.id,
                invoiceId: data.invoice_id,
                serviceId: data.service_id,
                description: data.description,
                quantity: parseFloat(data.quantity) || 0,
                unitPrice: parseFloat(data.unit_price) || 0,
                totalAmount: parseFloat(data.total_amount) || 0,
                periodStart: data.period_start,
                periodEnd: data.period_end
            };
        },

        update: async (id: string, item: Partial<InvoiceLineItem>): Promise<InvoiceLineItem | null> => {
            const { data, error } = await supabase
                .from('sub_invoice_line_items')
                .update({
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    total_amount: item.totalAmount,
                    period_start: item.periodStart,
                    period_end: item.periodEnd,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) return null;
            return {
                id: data.id,
                invoiceId: data.invoice_id,
                serviceId: data.service_id,
                description: data.description,
                quantity: parseFloat(data.quantity) || 0,
                unitPrice: parseFloat(data.unit_price) || 0,
                totalAmount: parseFloat(data.total_amount) || 0,
                periodStart: data.period_start,
                periodEnd: data.period_end
            };
        },

        delete: async (id: string): Promise<boolean> => {
            const { error } = await supabase
                .from('sub_invoice_line_items')
                .delete()
                .eq('id', id);

            return !error;
        }
    },

    // -------------------------

    subscriptions: {
        findAll: async (): Promise<Subscription[]> => {
            const { data, error } = await supabase
                .from('sub_subscriptions')
                .select(`
                    *,
                    vendor:sub_vendors(name, logo_url)
                `)
                .order('cost', { ascending: false });

            if (error) {
                console.error('Error fetching subscriptions:', error);
                return [];
            }

            // Map DB flat structure to Nested Type structure
            return (data || []).map((row: any) => ({
                id: row.id,
                vendorId: row.vendor_id,
                vendorName: row.vendor?.name || null,
                name: row.name,
                category: row.category,
                logo: row.vendor?.logo_url || row.logo,
                renewalDate: row.renewal_date,
                cost: row.cost,
                billingCycle: row.billing_cycle as BillingCycle,
                paymentMethod: row.payment_method as PaymentMethod,
                paymentDetails: row.payment_details,
                autoRenewal: row.auto_renewal ?? true,
                owner: {
                    name: row.owner_name || 'Unknown',
                    email: row.owner_email || '',
                },
                seats: {
                    total: row.seats_total,
                    used: row.seats_used,
                },
                status: row.status as SubscriptionStatus,
            }));
        },

        findLatestByVendor: async (vendorId: string): Promise<Subscription | null> => {
            const { data, error } = await supabase
                .from('sub_subscriptions')
                .select('*')
                .eq('vendor_id', vendorId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error) return null;

            return {
                id: data.id,
                vendorId: data.vendor_id,
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
                    name: data.owner_name || 'Unknown',
                    email: data.owner_email || '',
                },
                seats: {
                    total: data.seats_total,
                    used: data.seats_used,
                },
                status: data.status as SubscriptionStatus,
            };
        },

        // Batch find subscriptions by vendor IDs (for large imports)
        findByVendorIds: async (vendorIds: string[]): Promise<Map<string, Subscription>> => {
            if (vendorIds.length === 0) return new Map();

            const { data, error } = await supabase
                .from('sub_subscriptions')
                .select('*')
                .in('vendor_id', vendorIds)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error batch finding subscriptions:', error);
                return new Map();
            }

            // Return map keyed by vendor_id (first/latest subscription per vendor)
            const result = new Map<string, Subscription>();
            for (const row of data || []) {
                // Only keep first (latest due to order) subscription per vendor
                if (!result.has(row.vendor_id)) {
                    result.set(row.vendor_id, {
                        id: row.id,
                        vendorId: row.vendor_id,
                        name: row.name,
                        category: row.category,
                        logo: row.logo,
                        renewalDate: row.renewal_date,
                        cost: row.cost,
                        billingCycle: row.billing_cycle as BillingCycle,
                        paymentMethod: row.payment_method as PaymentMethod,
                        paymentDetails: row.payment_details,
                        autoRenewal: row.auto_renewal,
                        owner: {
                            name: row.owner_name || 'Unknown',
                            email: row.owner_email || '',
                        },
                        seats: {
                            total: row.seats_total,
                            used: row.seats_used,
                        },
                        status: row.status as SubscriptionStatus,
                    });
                }
            }
            return result;
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
                owner_name: sub.owner?.name || 'Unknown',
                owner_email: sub.owner?.email || '',
                seats_total: sub.seats?.total || 0,
                seats_used: sub.seats?.used || 0,
                status: sub.status || 'Active',
                vendor_id: sub.vendorId,
                agreement_type: 'Subscription'
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

            return {
                id: data.id,
                vendorId: data.vendor_id,
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
                    name: data.owner_name || 'Unknown',
                    email: data.owner_email || '',
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
                vendorId: data.vendor_id,
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
                    name: data.owner_name || 'Unknown',
                    email: data.owner_email || '',
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
                vendorId: data.vendor_id,
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
                    name: data.owner_name || 'Unknown',
                    email: data.owner_email || '',
                },
                seats: {
                    total: data.seats_total,
                    used: data.seats_used,
                },
                status: data.status as SubscriptionStatus,
            };
        },

        delete: async (id: string): Promise<boolean> => {
            // Manual cascade delete: Line Items (by service_id) -> Line Items (by invoice_id) -> Invoices -> Services -> Assignments -> Subscription
            try {
                // 1. Get services for this subscription to delete line items by service_id first
                const { data: services } = await supabase
                    .from('sub_subscription_services')
                    .select('id')
                    .eq('subscription_id', id);

                const serviceIds = services?.map(s => s.id) || [];

                // 2. Delete line items by service_id FIRST (critical - avoids FK violation)
                if (serviceIds.length > 0) {
                    await supabase
                        .from('sub_invoice_line_items')
                        .delete()
                        .in('service_id', serviceIds);
                }

                // 3. Get invoices to find any remaining line items
                const { data: invoices } = await supabase
                    .from('sub_invoices')
                    .select('id')
                    .eq('subscription_id', id);

                const invoiceIds = invoices?.map(i => i.id) || [];

                if (invoiceIds.length > 0) {
                    // 4. Delete any remaining line items by invoice_id
                    await supabase
                        .from('sub_invoice_line_items')
                        .delete()
                        .in('invoice_id', invoiceIds);

                    // 5. Delete invoices
                    await supabase
                        .from('sub_invoices')
                        .delete()
                        .in('id', invoiceIds);
                }

                // 6. Delete services (now safe - no line items reference them)
                if (serviceIds.length > 0) {
                    await supabase
                        .from('sub_subscription_services')
                        .delete()
                        .in('id', serviceIds);
                }

                // 7. Delete assignments
                await supabase
                    .from('sub_assignments')
                    .delete()
                    .eq('subscription_id', id);

                // 8. Delete subscription
                const { error } = await supabase
                    .from('sub_subscriptions')
                    .delete()
                    .eq('id', id);

                if (error) {
                    console.error('Error deleting subscription:', error);
                    return false;
                }
                return true;
            } catch (error) {
                console.error('Cascade delete logic failed:', error);
                return false;
            }
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
                assignedTo: row.assigned_to_user?.name || null,
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
