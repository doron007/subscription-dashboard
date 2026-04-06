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

export interface SupabaseLineItem {
  id: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number;
  period_start: string | null;
  period_end: string | null;
}

export interface SupabaseInvoice {
  id: string;
  vendor_name: string;
  vendor_id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  line_item_count: number;
  lineItems: SupabaseLineItem[];
}

export interface InvoiceOverrides {
  billingMonth?: string;
  importAction?: 'UPDATE' | 'CREATE' | 'SKIP' | 'CONFIRM';
  amountOverride?: number;
}

export interface MatchResult {
  etlInvoice: ETLInvoice;
  supabaseInvoice: SupabaseInvoice | null;
  supabaseInvoiceGroup?: SupabaseInvoice[]; // for MONTHLY_TOTAL: all invoices in the group
  matchType: 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'MONTHLY_TOTAL' | 'NONE';
  amountDiff: number;
}

// ─── Match Classification Types ────────────────────────────────────────────

export type ReviewReason =
  | 'AMOUNT_DIFF'       // CLOSE or MONTH_MATCH amount difference
  | 'MONTH_MISMATCH'    // EXACT amount but different billing month
  | 'NO_SAP_HISTORY'    // EXACT same-month but DB invoice not previously SAP-imported
  | 'MONTHLY_TOTAL'     // 1 SAP charge covers N DB invoices
  | 'SUSPECT_PAIRING';  // Coverage-gap: fixed vendor matched across months, may be wrong pairing

// Inline matched item type (mirrors SapImportAnalysis.matched[])
export interface MatchedItem {
  etl: ETLInvoice;
  supabase: SupabaseInvoice;
  supabaseGroup?: SupabaseInvoice[];
  matchType: 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'MONTHLY_TOTAL';
  amountDiff: number;
}

export interface NeedsReviewItem extends MatchedItem {
  reviewReasons: ReviewReason[];
  suggestion?: string;  // Smart suggestion based on vendor profile
}

// ─── Persistent Override Types ──────────────────────────────────────────────

export interface ETLOverride {
  id: string;
  groupKey: string;
  vendorName: string;
  dataYear: number;
  billingMonthOverride?: string;
  amountOverride?: number;
  importAction: string;    // PENDING | UPDATE | CREATE | SKIP
  sapAmount?: number;
  notes?: string;
  importedAt?: string;
  conflict?: boolean;      // computed: true when sapAmount differs from current ETL amount
  createdAt: string;
  updatedAt: string;
}

// ─── Vendor Profile Types ──────────────────────────────────────────────────

export interface VendorProfile {
  vendorName: string;
  invoiceCount: number;
  isFixedAmount: boolean;        // all invoices within $0.05 of each other
  typicalAmount: number | null;  // median amount (if fixed)
  amountRange: [number, number]; // [min, max]
  monthsCovered: string[];       // ['2026-01', '2026-02', '2026-03']
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
  matched: { etl: ETLInvoice; supabase: SupabaseInvoice; supabaseGroup?: SupabaseInvoice[]; matchType: 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'MONTHLY_TOTAL'; amountDiff: number }[];
  newInvoices: ETLInvoice[];
  supabaseOnly: SupabaseInvoice[];
  overrides: Record<string, ETLOverride>;
  vendorProfiles: Record<string, VendorProfile>;
  warnings: string[];
}

export interface ODataCredentials {
  baseUrl: string;
  username: string;
  password: string;
  year?: number;  // fiscal year for date filtering (default: current year)
}
