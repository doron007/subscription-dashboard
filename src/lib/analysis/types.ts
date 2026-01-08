export interface RawInvoiceLineItem {
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
}

export interface RawInvoice {
    vendor_name: string;
    invoice_date: string | null;
    invoice_number: string | null;
    currency: string;
    total_amount: number;
    line_items: RawInvoiceLineItem[];
    confidence_score: number;
}

export interface AggregatedLineItem {
    description: string; // The cleaned description
    original_descriptions: string[]; // For debugging/audit
    total_cost: number;
    usage_count: number; // e.g. how many times this item appeared across months or lines
}

export interface AggregatedSubscription {
    name: string;
    category: string;
    cost: number;
    last_transaction_date: string;
    confidence: number;
    reasoning: string;
    line_items: {
        description: string;
        cost: number;
        date: string;
    }[];
}

export interface PipelineContext {
    id: string; // UUID for the run
    logs: string[];
    steps: {
        name: string;
        status: 'pending' | 'success' | 'date_stripping_partial' | 'failed';
        duration_ms?: number;
        details?: any;
    }[];
}
