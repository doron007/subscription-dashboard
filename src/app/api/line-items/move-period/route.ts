import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';

type MoveLevel = 'invoice' | 'service' | 'lineItem';

interface MovePeriodRequest {
    level: MoveLevel;
    targetMonth: string; // ISO date string, e.g., "2025-08-01"
    filter: {
        invoiceId?: string;
        serviceName?: string;
        sourceMonth?: string;
        lineItemId?: string;
    };
}

/**
 * POST /api/line-items/move-period
 * Moves line items to a different billing period by setting billing_month_override.
 * Supports moving at invoice, service, or individual line item level.
 */
export async function POST(request: NextRequest) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body: MovePeriodRequest = await request.json();
        const { level, targetMonth, filter } = body;

        // Validate target month format
        if (!targetMonth || !/^\d{4}-\d{2}-\d{2}$/.test(targetMonth)) {
            return NextResponse.json(
                { error: 'Invalid targetMonth format. Use yyyy-MM-dd.' },
                { status: 400 }
            );
        }

        let affectedIds: string[] = [];
        let affectedCount = 0;

        switch (level) {
            case 'lineItem': {
                if (!filter.lineItemId) {
                    return NextResponse.json(
                        { error: 'lineItemId is required for lineItem level' },
                        { status: 400 }
                    );
                }

                const { error } = await supabase
                    .from('sub_invoice_line_items')
                    .update({ billing_month_override: targetMonth })
                    .eq('id', filter.lineItemId);

                if (error) throw error;
                affectedIds = [filter.lineItemId];
                affectedCount = 1;
                break;
            }

            case 'invoice': {
                if (!filter.invoiceId) {
                    return NextResponse.json(
                        { error: 'invoiceId is required for invoice level' },
                        { status: 400 }
                    );
                }

                const { data: items, error: fetchError } = await supabase
                    .from('sub_invoice_line_items')
                    .select('id')
                    .eq('invoice_id', filter.invoiceId);

                if (fetchError) throw fetchError;

                if (items && items.length > 0) {
                    const { error: updateError } = await supabase
                        .from('sub_invoice_line_items')
                        .update({ billing_month_override: targetMonth })
                        .eq('invoice_id', filter.invoiceId);

                    if (updateError) throw updateError;
                    affectedIds = items.map(i => i.id);
                    affectedCount = items.length;
                }
                break;
            }

            case 'service': {
                if (!filter.serviceName) {
                    return NextResponse.json(
                        { error: 'serviceName is required for service level' },
                        { status: 400 }
                    );
                }

                const { data: allItems, error: fetchError } = await supabase
                    .from('sub_invoice_line_items')
                    .select(`
                        id,
                        description,
                        period_start,
                        billing_month_override,
                        invoice:sub_invoices(invoice_date)
                    `)
                    .ilike('description', `%${filter.serviceName}%`);

                if (fetchError) throw fetchError;

                if (allItems && allItems.length > 0) {
                    let itemsToUpdate = allItems;

                    if (filter.sourceMonth) {
                        const { resolveBillingMonth } = await import('@/lib/periodParser');

                        itemsToUpdate = allItems.filter((item: any) => {
                            const currentBillingMonth = resolveBillingMonth(
                                item.billing_month_override,
                                item.period_start,
                                item.description || '',
                                item.invoice?.invoice_date
                            );
                            return currentBillingMonth === filter.sourceMonth;
                        });
                    }

                    if (itemsToUpdate.length > 0) {
                        const idsToUpdate = itemsToUpdate.map((i: any) => i.id);

                        const { error: updateError } = await supabase
                            .from('sub_invoice_line_items')
                            .update({ billing_month_override: targetMonth })
                            .in('id', idsToUpdate);

                        if (updateError) throw updateError;
                        affectedIds = idsToUpdate;
                        affectedCount = idsToUpdate.length;
                    }
                }
                break;
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid level. Must be invoice, service, or lineItem.' },
                    { status: 400 }
                );
        }

        return NextResponse.json({
            success: true,
            level,
            targetMonth,
            affectedCount,
            affectedIds
        });

    } catch {
        return NextResponse.json(
            { error: 'Failed to move period' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/line-items/move-period
 * Clears billing_month_override to revert to automatic period detection.
 */
export async function DELETE(request: NextRequest) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const { searchParams } = new URL(request.url);
        const lineItemId = searchParams.get('lineItemId');
        const invoiceId = searchParams.get('invoiceId');

        if (lineItemId) {
            const { error } = await supabase
                .from('sub_invoice_line_items')
                .update({ billing_month_override: null })
                .eq('id', lineItemId);

            if (error) throw error;
            return NextResponse.json({ success: true, cleared: 1 });
        }

        if (invoiceId) {
            const { data, error } = await supabase
                .from('sub_invoice_line_items')
                .update({ billing_month_override: null })
                .eq('invoice_id', invoiceId)
                .select('id');

            if (error) throw error;
            return NextResponse.json({ success: true, cleared: data?.length || 0 });
        }

        return NextResponse.json(
            { error: 'Either lineItemId or invoiceId is required' },
            { status: 400 }
        );

    } catch {
        return NextResponse.json(
            { error: 'Failed to clear override' },
            { status: 500 }
        );
    }
}
