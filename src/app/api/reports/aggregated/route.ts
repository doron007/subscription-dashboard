import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/api-auth';
import { format, parseISO } from 'date-fns';

const LINE_ITEM_SELECT = `
    id,
    description,
    total_amount,
    period_start,
    period_end,
    billing_month_override,
    invoice:sub_invoices!inner(
        invoice_date,
        subscription_id,
        vendor:sub_vendors(id, name)
    )
`;

/**
 * Fetch all line items using pagination to bypass Supabase's max_rows limit.
 * The server-side max_rows setting (default 1000) caps individual requests,
 * so we fetch in batches and combine results.
 */
async function fetchAllLineItems(supabase: ReturnType<typeof getSupabaseAdmin>) {
    const PAGE_SIZE = 1000;
    let allItems: any[] = [];
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from('sub_invoice_line_items')
            .select(LINE_ITEM_SELECT)
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allItems = allItems.concat(data);

        if (data.length < PAGE_SIZE) break; // Last page
        offset += PAGE_SIZE;
    }

    return allItems;
}

/**
 * GET /api/reports/aggregated
 * Returns pre-aggregated data for the Reports page.
 *
 * Query params:
 * - startDate: YYYY-MM-DD (required)
 * - endDate: YYYY-MM-DD (required)
 * - groupBy: 'vendor' | 'service' (default: 'vendor')
 *
 * This moves expensive aggregation from client to server/database.
 */
export async function GET(request: NextRequest) {
    const { response } = await requireAuth();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const groupBy = searchParams.get('groupBy') || 'vendor';

    if (!startDate || !endDate) {
        return NextResponse.json(
            { error: 'startDate and endDate are required' },
            { status: 400 }
        );
    }

    const supabase = getSupabaseAdmin();

    try {
        // Extract year-month for comparison (YYYY-MM format)
        const startYM = startDate.substring(0, 7);
        const endYM = endDate.substring(0, 7);

        // Fetch ALL line items using pagination to bypass max_rows limit
        const lineItems = await fetchAllLineItems(supabase);

        console.log('[Reports API] Total line items fetched:', lineItems.length);
        console.log('[Reports API] Date range:', startYM, 'to', endYM);

        // Process and aggregate on server
        const monthlyData = new Map<string, Map<string, number>>(); // month -> (key -> amount)
        const totals = new Map<string, number>(); // key -> total amount
        const availableMonths = new Set<string>();
        const availableVendors = new Set<string>();
        const availableServices = new Set<string>();
        let processedCount = 0;

        for (const item of lineItems) {
            const amount = parseFloat(item.total_amount) || 0;
            if (amount === 0) continue;

            // Cast invoice to handle Supabase's complex return type
            const invoice = item.invoice as any;
            const invoiceDate = invoice?.invoice_date;
            const vendor = Array.isArray(invoice?.vendor) ? invoice.vendor[0] : invoice?.vendor;

            // Resolve billing month using priority: override > period_start > invoice_date
            let billingMonth: string;
            if (item.billing_month_override) {
                billingMonth = item.billing_month_override.substring(0, 7);
            } else if (item.period_start) {
                billingMonth = item.period_start.substring(0, 7);
            } else if (invoiceDate) {
                billingMonth = invoiceDate.substring(0, 7);
            } else {
                continue; // Skip items without any date
            }

            // Filter by billing month range (YYYY-MM string comparison works correctly)
            if (billingMonth < startYM || billingMonth > endYM) {
                continue;
            }

            processedCount++;
            const vendorName = vendor?.name || 'Unknown Vendor';
            const serviceName = extractServiceName(item.description || '');

            availableMonths.add(billingMonth);
            availableVendors.add(vendorName);
            availableServices.add(serviceName);

            const key = groupBy === 'service' ? serviceName : vendorName;

            // Monthly aggregation
            if (!monthlyData.has(billingMonth)) {
                monthlyData.set(billingMonth, new Map());
            }
            const monthMap = monthlyData.get(billingMonth)!;
            monthMap.set(key, (monthMap.get(key) || 0) + amount);

            // Total aggregation
            totals.set(key, (totals.get(key) || 0) + amount);
        }

        // Convert to response format - ensure chronological order
        const sortedMonths = Array.from(monthlyData.keys()).sort();
        const monthlyTrend = sortedMonths.map(month => {
            const values = monthlyData.get(month)!;
            const point: Record<string, any> = {
                month,
                label: format(parseISO(month + '-01'), 'MMM yy'),
                total: 0
            };
            values.forEach((amount, key) => {
                point[key] = amount;
                point.total += amount;
            });
            return point;
        });

        // Sort totals by amount (descending)
        const breakdown = Array.from(totals.entries())
            .sort(([, a], [, b]) => b - a)
            .map(([name, cost], index) => ({
                name,
                cost,
                percentage: 0,
                colorIndex: index
            }));

        const grandTotal = breakdown.reduce((sum, item) => sum + item.cost, 0);

        console.log('[Reports API] Processed:', processedCount, 'items, Grand total:', grandTotal.toFixed(2));

        breakdown.forEach(item => {
            item.percentage = grandTotal > 0 ? (item.cost / grandTotal) * 100 : 0;
        });

        // Get the keys in order of total spend (for chart stacking)
        const stackKeys = breakdown.map(item => item.name);

        return NextResponse.json({
            monthlyTrend,
            breakdown,
            stackKeys,
            grandTotal,
            filters: {
                availableMonths: Array.from(availableMonths).sort().reverse(),
                availableVendors: Array.from(availableVendors).sort(),
                availableServices: Array.from(availableServices).sort()
            },
            meta: {
                startDate,
                endDate,
                groupBy,
                lineItemCount: processedCount,
                totalLineItems: lineItems?.length || 0
            }
        });
    } catch (err) {
        console.error('Error in aggregated report:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Extract clean service name from description (same logic as client)
function extractServiceName(description: string): string {
    if (!description) return 'Other';

    let cleaned = description.trim();

    // Remove date range suffix pattern
    cleaned = cleaned.replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}-\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '');
    cleaned = cleaned.replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned || 'Other';
}
