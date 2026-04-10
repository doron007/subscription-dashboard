import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/api-auth';

const KPI_LINE_ITEM_SELECT = `
    total_amount,
    period_start,
    billing_month_override,
    invoice:sub_invoices!inner(
        invoice_date,
        payment_status
    )
`;

/**
 * Fetch all line items using pagination to bypass Supabase's max_rows limit.
 */
async function fetchAllLineItems(supabase: ReturnType<typeof getSupabaseAdmin>) {
    const PAGE_SIZE = 1000;
    let allItems: any[] = [];
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from('sub_invoice_line_items')
            .select(KPI_LINE_ITEM_SELECT)
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allItems = allItems.concat(data);

        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return allItems;
}

/**
 * GET /api/reports/kpi
 * Returns YTD KPI stats computed from line items using billing month logic
 * (billing_month_override > period_start > invoice_date).
 * This ensures KPI cards match the analytics chart totals.
 */
export async function GET(request: NextRequest) {
    const { response } = await requireAuth();
    if (response) return response;

    const supabase = getSupabaseAdmin();
    const year = new Date().getFullYear();
    const yearPrefix = `${year}-`;

    try {
        const lineItems = await fetchAllLineItems(supabase);

        let spendYTD = 0;
        let paidYTD = 0;
        let outstandingAmount = 0;
        let unpaidCount = 0;
        const paymentStatusCounts: Record<string, number> = {};
        const unpaidInvoiceIds = new Set<string>();

        for (const item of lineItems || []) {
            const amount = parseFloat(item.total_amount) || 0;
            if (amount === 0) continue;

            const invoice = item.invoice as any;

            // Resolve billing month: override > period_start > invoice_date
            let billingMonth: string;
            if (item.billing_month_override) {
                billingMonth = item.billing_month_override.substring(0, 7);
            } else if (item.period_start) {
                billingMonth = item.period_start.substring(0, 7);
            } else if (invoice?.invoice_date) {
                billingMonth = invoice.invoice_date.substring(0, 7);
            } else {
                continue;
            }

            // Only count YTD
            if (billingMonth < yearPrefix.substring(0, 7)) continue;

            const paymentStatus = invoice?.payment_status || 'Unknown';

            spendYTD += amount;

            if (paymentStatus === 'Paid') {
                paidYTD += amount;
            } else if (paymentStatus === 'Not Paid') {
                outstandingAmount += amount;
            }

            paymentStatusCounts[paymentStatus] = (paymentStatusCounts[paymentStatus] || 0) + 1;
        }

        // Count unique unpaid invoices for subtext
        const { data: unpaidInvoices } = await supabase
            .from('sub_invoices')
            .select('id')
            .eq('payment_status', 'Not Paid')
            .gte('invoice_date', `${year}-01-01`);

        unpaidCount = unpaidInvoices?.length || 0;

        return NextResponse.json({
            spendYTD: Math.round(spendYTD * 100) / 100,
            paidYTD: Math.round(paidYTD * 100) / 100,
            outstandingAmount: Math.round(outstandingAmount * 100) / 100,
            unpaidCount,
            paymentStatusCounts,
            year,
        });
    } catch (err) {
        console.error('Error in KPI report:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
