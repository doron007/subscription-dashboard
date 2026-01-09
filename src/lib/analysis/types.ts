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

export interface AnalyzedInvoice {
    vendor: {
        name: string;
        contact_email?: string;
        website?: string;
    };
    invoice: {
        number: string;
        date: string;
        due_date?: string;
        total_amount: number;
        currency: string;
    };
    line_items: AnalyzedLineItem[];
    summary: {
        total_lines: number;
        confidence_score: number;
    };
}

export interface AnalyzedLineItem {
    description: string; // Cleaned description (e.g. "Office 365 E3")
    quantity: number;
    unit_price: number;
    total_amount: number;
    service_name: string; // The predicted "Service Catalog" name
    period_start?: string;
    period_end?: string;
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
