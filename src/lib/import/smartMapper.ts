/**
 * Smart CSV Mapper - AI-powered column mapping for dynamic CSV imports
 *
 * This module uses AI to analyze CSV headers and sample data to:
 * 1. Detect the CSV format type (invoice, transaction, etc.)
 * 2. Map columns to a standard internal schema
 * 3. Transform data for unified processing
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Standard internal format that all imports convert to
export interface StandardLineItem {
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
    // Optional metadata
    notes?: string;
    category?: string;
    transactionId?: string;
}

export type CSVFormatType = 'invoice' | 'transaction' | 'unknown';

export interface ColumnMapping {
    vendor: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    serviceMonth: string | null;
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    totalPrice: string | null;
    paidDate: string | null;
    status: string | null;
    notes: string | null;
    category: string | null;
    transactionId: string | null;
}

export interface MappingResult {
    formatType: CSVFormatType;
    confidence: number;
    mapping: ColumnMapping;
    transformRules: TransformRule[];
    reasoning: string;
}

export interface TransformRule {
    field: string;
    rule: string;
    description: string;
}

/**
 * Analyze CSV headers and sample data using AI to determine column mapping
 */
export async function analyzeCSVFormat(
    headers: string[],
    sampleRows: Record<string, string>[]
): Promise<MappingResult> {
    if (!OPENROUTER_API_KEY) {
        // Fallback to heuristic detection if no API key
        return heuristicMapping(headers, sampleRows);
    }

    const prompt = buildMappingPrompt(headers, sampleRows);

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1 // Low temperature for consistent mapping
            })
        });

        if (!response.ok) {
            console.error("[SmartMapper] AI call failed, using heuristic");
            return heuristicMapping(headers, sampleRows);
        }

        const json = await response.json();
        const aiContent = json.choices[0]?.message?.content || '';

        // Parse AI response
        const cleanJson = aiContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanJson) as MappingResult;

        console.log("[SmartMapper] AI mapping result:", result.formatType, result.confidence);
        return result;

    } catch (error) {
        console.error("[SmartMapper] Error:", error);
        return heuristicMapping(headers, sampleRows);
    }
}

/**
 * Build the AI prompt for column mapping
 */
function buildMappingPrompt(headers: string[], sampleRows: Record<string, string>[]): string {
    const headerList = headers.join(', ');
    const sampleData = sampleRows.slice(0, 5).map((row, i) => {
        const values = headers.map(h => `${h}: "${row[h] || ''}"`).join(', ');
        return `Row ${i + 1}: { ${values} }`;
    }).join('\n');

    return `You are a data mapping expert. Analyze this CSV structure and map it to our standard schema.

**CSV Headers:** ${headerList}

**Sample Data:**
${sampleData}

**Standard Schema Fields:**
- vendor: Company/merchant name providing the service
- invoiceNumber: Unique invoice or transaction identifier
- invoiceDate: Date of the invoice or transaction
- serviceMonth: Month the service was for (if applicable)
- description: Line item description or service name
- quantity: Number of units
- unitPrice: Price per unit
- totalPrice: Total amount (can be negative for charges)
- paidDate: Date payment was made (if available)
- status: Payment/approval status
- notes: Additional notes or comments
- category: Expense category
- transactionId: Unique transaction ID (if different from invoice)

**Format Types:**
- "invoice": Traditional invoice with vendor, invoice number, line items (e.g., SAP/ERP exports)
- "transaction": Credit card or bank transactions with merchant, date, amount (e.g., CC statements)

**Rules for Mapping:**
1. Map each standard field to the most appropriate CSV column (use exact column name)
2. Use null if no suitable column exists
3. For "transaction" format: merchant name maps to vendor, transaction description to description
4. Amount fields may be negative (charges) - note this in transformRules
5. If invoice number doesn't exist, suggest generating from date + vendor + amount

**Response Format (JSON only, no markdown):**
{
    "formatType": "invoice" | "transaction",
    "confidence": 0.0-1.0,
    "mapping": {
        "vendor": "column_name" | null,
        "invoiceNumber": "column_name" | null,
        "invoiceDate": "column_name" | null,
        "serviceMonth": "column_name" | null,
        "description": "column_name" | null,
        "quantity": "column_name" | null,
        "unitPrice": "column_name" | null,
        "totalPrice": "column_name" | null,
        "paidDate": "column_name" | null,
        "status": "column_name" | null,
        "notes": "column_name" | null,
        "category": "column_name" | null,
        "transactionId": "column_name" | null
    },
    "transformRules": [
        { "field": "totalPrice", "rule": "negate_if_negative", "description": "Amount is negative for charges" },
        { "field": "invoiceNumber", "rule": "generate_from_date_vendor", "description": "No invoice number, generate composite key" }
    ],
    "reasoning": "Brief explanation of detected format and mapping decisions"
}`;
}

/**
 * Heuristic-based mapping when AI is not available
 */
function heuristicMapping(headers: string[], sampleRows: Record<string, string>[]): MappingResult {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    // Detect format type based on headers
    const hasInvoice = lowerHeaders.some(h => h.includes('invoice'));
    const hasLineItem = lowerHeaders.some(h => h.includes('line item'));
    const hasMerchant = lowerHeaders.some(h => h.includes('merchant'));
    const hasTransaction = lowerHeaders.some(h => h.includes('transaction'));

    const isInvoiceFormat = hasInvoice && hasLineItem;
    const isTransactionFormat = hasMerchant || hasTransaction;

    const formatType: CSVFormatType = isInvoiceFormat ? 'invoice' : (isTransactionFormat ? 'transaction' : 'unknown');

    // Find columns by common patterns
    const findColumn = (patterns: string[]): string | null => {
        for (const pattern of patterns) {
            const idx = lowerHeaders.findIndex(h => h.includes(pattern));
            if (idx >= 0) return headers[idx];
        }
        return null;
    };

    const mapping: ColumnMapping = {
        vendor: findColumn(['vendor', 'merchant', 'clean merchant', 'supplier', 'payee']),
        invoiceNumber: findColumn(['invoice', 'transaction id', 'reference', 'ref']),
        invoiceDate: findColumn(['date', 'invoice date', 'transaction date', 'posted']),
        serviceMonth: findColumn(['service month', 'period', 'billing period']),
        description: findColumn(['line item', 'description', 'desc', 'memo', 'narrative']),
        quantity: findColumn(['qty', 'quantity', 'units']),
        unitPrice: findColumn(['unit price', 'price', 'rate']),
        totalPrice: findColumn(['total', 'amount', 'total price', 'cost']),
        paidDate: findColumn(['paid', 'payment date', 'cleared']),
        status: findColumn(['status', 'state', 'approval']),
        notes: findColumn(['notes', 'comment', 'memo', 'remarks']),
        category: findColumn(['category', 'expense', 'type', 'class']),
        transactionId: findColumn(['transaction id', 'trans id', 'id'])
    };

    const transformRules: TransformRule[] = [];

    // Check if amounts are negative
    if (sampleRows.length > 0 && mapping.totalPrice) {
        const firstAmount = sampleRows[0][mapping.totalPrice];
        if (firstAmount && firstAmount.includes('-')) {
            transformRules.push({
                field: 'totalPrice',
                rule: 'abs_value',
                description: 'Convert negative amounts to positive'
            });
        }
    }

    // Generate invoice number if missing
    if (!mapping.invoiceNumber && formatType === 'transaction') {
        transformRules.push({
            field: 'invoiceNumber',
            rule: 'generate_from_date_vendor_amount',
            description: 'Generate invoice number from date + vendor + amount'
        });
    }

    return {
        formatType,
        confidence: formatType === 'unknown' ? 0.3 : 0.7,
        mapping,
        transformRules,
        reasoning: `Heuristic detection: ${formatType} format based on column names`
    };
}

/**
 * Transform raw CSV rows to standard format using the mapping
 */
export function transformToStandard(
    rows: Record<string, string>[],
    mapping: ColumnMapping,
    transformRules: TransformRule[]
): StandardLineItem[] {
    const ruleMap = new Map(transformRules.map(r => [r.field, r.rule]));

    return rows.map((row, idx) => {
        // Extract values using mapping
        const getValue = (field: keyof ColumnMapping): string => {
            const column = mapping[field];
            if (!column) return '';
            return (row[column] || '').trim();
        };

        // Parse amount, handling negatives and currency symbols
        const parseAmount = (value: string): number => {
            if (!value) return 0;
            const isNegative = value.includes('(') || value.startsWith('-');
            const cleaned = value.replace(/[$,()"\s-]/g, '');
            const num = parseFloat(cleaned) || 0;

            // Apply abs_value rule if needed
            if (ruleMap.get('totalPrice') === 'abs_value') {
                return Math.abs(num);
            }

            return isNegative ? Math.abs(num) : num;
        };

        // Parse date to ISO format
        const parseDate = (value: string): string => {
            if (!value) return '';
            try {
                // Handle various date formats
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0];
                }
            } catch {
                // Ignore parse errors
            }
            return value;
        };

        // Get or generate invoice number
        let invoiceNumber = getValue('invoiceNumber') || getValue('transactionId');
        if (!invoiceNumber && ruleMap.has('invoiceNumber')) {
            // Generate composite key
            const date = getValue('invoiceDate');
            const vendor = getValue('vendor');
            const amount = getValue('totalPrice');
            invoiceNumber = `${date}-${vendor.substring(0, 10).replace(/\s+/g, '')}-${Math.abs(parseAmount(amount)).toFixed(0)}`;
        }

        // Derive service month from date if not provided
        let serviceMonth = getValue('serviceMonth');
        if (!serviceMonth) {
            const dateStr = getValue('invoiceDate');
            if (dateStr) {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    serviceMonth = months[date.getMonth()];
                }
            }
        }

        // Build description from multiple potential sources
        let description = getValue('description');
        if (!description) {
            // For transactions, use vendor + category as description
            const vendor = getValue('vendor');
            const category = getValue('category');
            const notes = getValue('notes');
            description = notes || category || vendor || `Transaction ${idx + 1}`;
        }

        // Determine payment status
        const status = getValue('status')?.toLowerCase() || '';
        const paidDate = getValue('paidDate');
        const isVoided = status.includes('void') || status.includes('cancel');
        const isPaid = status.includes('paid') || status.includes('approved') || status.includes('cleared') || !!paidDate;

        return {
            vendor: getValue('vendor') || 'Unknown Vendor',
            invoiceNumber: invoiceNumber || `ROW-${idx + 1}`,
            invoiceDate: parseDate(getValue('invoiceDate')),
            serviceMonth,
            description,
            quantity: parseFloat(getValue('quantity')) || 1,
            unitPrice: parseAmount(getValue('unitPrice')),
            totalPrice: parseAmount(getValue('totalPrice')),
            paidDate: isPaid ? (parseDate(paidDate) || parseDate(getValue('invoiceDate'))) : null,
            isVoided,
            notes: getValue('notes'),
            category: getValue('category'),
            transactionId: getValue('transactionId')
        };
    }).filter(item => item.totalPrice !== 0); // Filter out zero-amount rows
}

/**
 * Group transactions by vendor and month to create invoice-like structures
 */
export function groupTransactionsAsInvoices(items: StandardLineItem[]): Map<string, StandardLineItem[]> {
    const groups = new Map<string, StandardLineItem[]>();

    for (const item of items) {
        // Create key from vendor + month
        const date = new Date(item.invoiceDate);
        const monthKey = !isNaN(date.getTime())
            ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            : 'unknown';
        const key = `${item.vendor}|${monthKey}`;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(item);
    }

    return groups;
}
