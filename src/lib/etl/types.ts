// ─── SAP ETL Types ──────────────────────────────────────────────────────────

export interface SAPRow {
  postingDate: string;       // ISO date
  businessPartner: string;
  description: string;       // Journal Entry Item Text
  offsetSupplier: string;    // Offset Customer / Supplier ID
  offsetDocId: string;       // Offset Operational Document ID
  operationalDocId: string;  // Operational Document ID
  debitAmount: number;
  creditAmount: number;
  rawRow: Record<string, string>;
}

export type RowClassification =
  | 'VENDOR_DEBIT'
  | 'VENDOR_CREDIT'
  | 'CC_SUBSCRIPTION'
  | 'CC_EXPENSE'
  | 'VENDOR_IN_DESC'
  | 'PAYROLL'
  | 'ACCRUAL'
  | 'OTHER';

export interface ClassifiedRow extends SAPRow {
  classification: RowClassification;
  supabaseVendor: string | null;
}

export interface ETLInvoice {
  sapVendor: string;
  supabaseVendor: string;
  groupKey: string;
  postingDate: string;
  billingMonth: string;
  rawAmount: number;
  computedAmount: number;    // After reversing cost allocations
  allocationNote: string;
  lineItems: ClassifiedRow[];
}

export interface SupabaseInvoice {
  id: string;
  vendor_name: string;
  vendor_id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  line_item_count: number;
}

export interface MatchResult {
  etlInvoice: ETLInvoice;
  supabaseInvoice: SupabaseInvoice | null;
  matchType: 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'NONE';
  amountDiff: number;
}

// ─── API-specific types ─────────────────────────────────────────────────────

export interface SapImportAnalysis {
  sapMeta: {
    totalGLRows: number;
    classification: Record<string, number>;
    etlInvoiceCount: number;
    dataYear: number;
    fetchDurationMs: number;
  };
  matched: { etl: ETLInvoice; supabase: SupabaseInvoice; matchType: 'EXACT' | 'CLOSE' | 'MONTH_MATCH'; amountDiff: number }[];
  newInvoices: ETLInvoice[];
  supabaseOnly: SupabaseInvoice[];
  warnings: string[];
}

export interface ODataCredentials {
  baseUrl: string;
  username: string;
  password: string;
}
