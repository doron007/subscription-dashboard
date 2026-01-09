import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dgghsrmxzasdvckncpjf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verify() {
    console.log('--- Verifying Invoice Pipeline Data ---');

    // 1. Check latest vendor
    const { data: vendors, error: vendorError } = await supabase
        .from('sub_vendors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (vendorError) {
        console.error('Error fetching vendors:', vendorError);
        return;
    }
    const vendor = vendors[0];
    console.log(`Latest Vendor: ${vendor?.name} (ID: ${vendor?.id})`);

    // 2. Check latest subscription (Agreement)
    const { data: subscriptions, error: subError } = await supabase
        .from('sub_subscriptions')
        .select('*')
        .eq('vendor_id', vendor?.id)
        .order('created_at', { ascending: false })
        .limit(1);

    if (subError) {
        console.error('Error fetching subscriptions:', subError);
        return;
    }
    const subscription = subscriptions[0];
    console.log(`Latest Agreement: ${subscription?.name} (ID: ${subscription?.id})`);

    // 3. Check Services linked to this subscription
    const { data: services, error: serviceError } = await supabase
        .from('sub_subscription_services')
        .select('*')
        .eq('subscription_id', subscription?.id);

    if (serviceError) {
        console.error('Error fetching services:', serviceError);
    } else {
        console.log(`Found ${services.length} services linked to Agreement.`);
        services.forEach(s => console.log(` - Service: ${s.name}, Qty: ${s.current_quantity}, Price: ${s.current_unit_price}`));
    }

    // 4. Check Invoices
    const { data: invoices, error: invError } = await supabase
        .from('sub_invoices')
        .select('*')
        .eq('vendor_id', vendor?.id)
        .order('created_at', { ascending: false })
        .limit(1);

    if (invError) {
        console.error('Error fetching invoices:', invError);
    }
    const invoice = invoices?.[0];
    console.log(`Latest Invoice: ${invoice?.invoice_number} (ID: ${invoice?.id}), Amount: ${invoice?.total_amount}`);

    // 5. Check Invoice Line Items
    if (invoice) {
        const { data: lines, error: lineError } = await supabase
            .from('sub_invoice_line_items')
            .select('*')
            .eq('invoice_id', invoice.id);

        if (lineError) {
            console.error('Error fetching line items:', lineError);
        } else {
            console.log(`Found ${lines.length} invoice line items.`);
            lines.forEach(l => console.log(` - Line: ${l.description}, Qty: ${l.quantity}, Total: ${l.total_amount}`));
        }
    }

    console.log('--- Verification Complete ---');
}

verify().catch(console.error);
