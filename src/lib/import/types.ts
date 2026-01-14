// Types for CSV Delta Import System

export type DiffType = 'NEW' | 'CHANGED' | 'UNCHANGED' | 'REMOVED' | 'VOIDED';
export type MergeStrategy = 'csv_wins' | 'keep_existing' | 'skip';
// How to handle voided (not yet processed by accounting) invoices
export type VoidedAction = 'import_unpaid' | 'skip';

// Raw CSV row from SAP export
// Note: SAP headers may have varying whitespace, so we use index signature for flexibility
export interface RawCSVRow {
    Vendor: string;
    Invoice: string;
    'Invoice Date': string;
    'Service Month': string;
    'Line Item': string;
    QTY: string;
    ' Unit Price ': string;  // Note: SAP has spaces in header
    ' Total Price ': string;
    Paid: string;
    // Allow additional properties for header variations
    [key: string]: string | undefined;
}

// Normalized line item from CSV
export interface ParsedLineItem {
    vendor: string;
    invoiceNumber: string;
    invoiceDate: string;
    serviceMonth: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    paidDate: string | null;
    isVoided: boolean;
    // Composite key for matching
    lineItemKey: string;
}

// Parsed invoice (grouped line items)
export interface ParsedInvoice {
    vendor: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmount: number;
    isVoided: boolean;
    paidDate: string | null;
    lineItems: ParsedLineItem[];
}

// Diff result for a single field
export interface FieldDiff {
    field: string;
    existingValue: any;
    newValue: any;
    isDifferent: boolean;
}

// Diff result for a line item
export interface LineItemDiff {
    diffType: DiffType;
    lineItemKey: string;
    description: string;
    existing: {
        quantity: number;
        unitPrice: number;
        totalAmount: number;
        periodStart?: string;
        periodEnd?: string;
    } | null;
    incoming: {
        quantity: number;
        unitPrice: number;
        totalAmount: number;
        serviceMonth: string;
    } | null;
    fieldDiffs: FieldDiff[];
    // For UI selection
    selected: boolean;
    mergeStrategy: MergeStrategy;
}

// Diff result for an invoice
export interface InvoiceDiff {
    diffType: DiffType;
    invoiceNumber: string;
    vendor: string;
    existing: {
        id: string;
        invoiceDate: string;
        totalAmount: number;
        status: string;
        lineItemCount: number;
    } | null;
    incoming: {
        invoiceDate: string;
        totalAmount: number;
        isVoided: boolean;
        paidDate: string | null;
        lineItemCount: number;
    } | null;
    lineItemDiffs: LineItemDiff[];
    // Aggregated stats
    stats: {
        newLineItems: number;
        changedLineItems: number;
        unchangedLineItems: number;
        removedLineItems: number;
    };
    // For UI selection
    selected: boolean;
    mergeStrategy: MergeStrategy;
    // For voided invoices: how to handle them
    voidedAction: VoidedAction;
}

// Complete analysis result
export interface ImportAnalysis {
    filename: string;
    analyzedAt: string;
    summary: {
        totalInvoices: number;
        newInvoices: number;
        updatedInvoices: number;
        unchangedInvoices: number;
        voidedInvoices: number;
        totalLineItems: number;
        newLineItems: number;
        changedLineItems: number;
        unchangedLineItems: number;
        removedLineItems: number;
    };
    vendors: {
        name: string;
        isNew: boolean;
        invoiceCount: number;
    }[];
    invoiceDiffs: InvoiceDiff[];
    warnings: string[];
}

// User decisions for import execution
export type ImportAction = 'import' | 'skip' | 'update';
export type LineItemAction = 'import' | 'skip' | 'update' | 'delete';

export interface ImportDecision {
    invoiceNumber: string;
    action: ImportAction;
    mergeStrategy: MergeStrategy;
    lineItemDecisions: {
        lineItemKey: string;
        action: LineItemAction;
        mergeStrategy: MergeStrategy;
    }[];
}

export interface ImportExecutionRequest {
    analysisId: string;
    decisions: ImportDecision[];
    globalStrategy: MergeStrategy;
}

export interface ImportExecutionResult {
    success: boolean;
    created: {
        vendors: number;
        invoices: number;
        lineItems: number;
        services: number;
    };
    updated: {
        invoices: number;
        lineItems: number;
    };
    skipped: {
        invoices: number;
        lineItems: number;
    };
    errors: string[];
}
