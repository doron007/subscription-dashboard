import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET /api/sap/overrides?year=2026 — fetch all overrides for a year
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sub_etl_overrides')
    .select('*')
    .eq('data_year', year)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ overrides: data || [] });
}

// POST /api/sap/overrides — upsert an override
export async function POST(request: Request) {
  const body = await request.json();
  const { groupKey, vendorName, dataYear, billingMonthOverride, amountOverride, importAction, sapAmount, notes, setImportedAt, paymentStatusOverride } = body;

  if (!groupKey || !dataYear) {
    return NextResponse.json({ error: 'groupKey and dataYear are required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Upsert by (group_key, data_year)
  const { data, error } = await supabase
    .from('sub_etl_overrides')
    .upsert(
      {
        group_key: groupKey,
        vendor_name: vendorName || '',
        data_year: dataYear,
        billing_month_override: billingMonthOverride || null,
        amount_override: amountOverride || null,
        import_action: importAction || 'PENDING',
        sap_amount: sapAmount || null,
        notes: notes || null,
        payment_status_override: paymentStatusOverride || null,
        updated_at: new Date().toISOString(),
        ...(setImportedAt ? { imported_at: new Date().toISOString() } : {}),
      },
      { onConflict: 'group_key,data_year' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ override: data });
}
