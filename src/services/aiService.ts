export interface AnalyzedSubscription {
    name: string;
    category: string;
    cost: number;
    last_transaction_date?: string;
    confidence: number;
    reasoning: string;
    invoice_number?: string; // Actual invoice number from source document
    line_items?: {
        description: string;
        cost: number;
        date?: string;
        // New granular fields
        service_name?: string;
        quantity?: number;
        unit_price?: number;
        total_amount?: number;
    }[];
}

export const aiService = {
    analyze: async (transactions: any[]): Promise<AnalyzedSubscription[]> => {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Msg analysis failed');
        }

        const data = await response.json();
        return data.candidates;
    },

    analyzeImages: async (images: string[]): Promise<AnalyzedSubscription[]> => {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images }),
        });

        if (!response.ok) {
            const err = await response.json();
            console.error("[AI Service] Error Details:", err.details);
            console.error("[AI Service] Logs:", err.logs);
            throw new Error(err.details || err.error || 'Image analysis failed');
        }

        const data = await response.json();

        // Handle new API shape { analysis: ... }
        if (data.analysis) {
            // Adapt AnalyzedInvoice to AnalyzedSubscription[] for frontend compatibility
            // This allows us to keep the frontend mostly the same while passing through rich data
            const analysis = data.analysis;
            const adapted: AnalyzedSubscription = {
                name: analysis.vendor.name,
                category: "Software", // Default
                cost: analysis.invoice.total_amount,
                last_transaction_date: analysis.invoice.date,
                confidence: analysis.summary.confidence_score,
                reasoning: `Extracted from invoice ${analysis.invoice.number}`,
                invoice_number: analysis.invoice.number, // Preserve actual invoice number for idempotency
                line_items: analysis.line_items.map((li: any) => ({
                    description: li.description,
                    cost: li.total_amount,
                    date: analysis.invoice.date,
                    service_name: li.service_name,
                    quantity: li.quantity,
                    unit_price: li.unit_price,
                    total_amount: li.total_amount
                }))
            };
            return [adapted];
        }

        return data.candidates;
    }
};
