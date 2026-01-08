export interface AnalyzedSubscription {
    name: string;
    category: string;
    cost: number;
    last_transaction_date?: string;
    confidence: number;
    reasoning: string;
    line_items?: {
        description: string;
        cost: number;
        date?: string;
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
            throw new Error(err.error || 'Image analysis failed');
        }

        const data = await response.json();
        return data.candidates;
    }
};
