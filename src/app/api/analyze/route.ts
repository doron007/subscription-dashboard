import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { runInvoiceAnalysisPipeline } from '@/lib/analysis/pipeline';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL;
const SITE_NAME = 'Subscription Dashboard';

/**
 * POST /api/analyze
 * Analyzes invoice images or transaction data using AI to extract structured information.
 * Supports two modes:
 * - Vision mode: Analyzes invoice images (PDF/images) using AI vision
 * - Text mode: Analyzes CSV transaction data to identify subscriptions
 */
export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    if (!OPENROUTER_API_KEY) {
        return NextResponse.json({ error: 'OpenRouter API Key not configured' }, { status: 500 });
    }

    if (!SITE_URL) {
        return NextResponse.json({ error: 'Application URL not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { transactions, images } = body;

        let parsedData;

        if (images && Array.isArray(images)) {
            // Vision pipeline for invoice image analysis

            const result = await runInvoiceAnalysisPipeline(images);

            if (!result.success || !result.data) {
                return NextResponse.json({
                    error: 'Analysis Failed',
                    details: result.error,
                    logs: result.context.logs
                }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                analysis: result.data,
                logs: result.context.logs
            });

        } else if (transactions) {
            // Text-based transaction analysis for subscription detection
            const model = "google/gemini-2.0-flash-001";

            if (!Array.isArray(transactions)) {
                return NextResponse.json({ error: 'Invalid input: transactions array required' }, { status: 400 });
            }

            // Helper to find key case-insensitively
            const findKey = (obj: any, candidates: string[]) => {
                const keys = Object.keys(obj);
                for (const candidate of candidates) {
                    // eslint-disable-next-line
                    const found = keys.find(k => k.toLowerCase().includes(candidate.toLowerCase()) || k.toLowerCase() === candidate.toLowerCase());
                    if (found) return found;
                }
                return null;
            };

            // Limit to first 50 transactions
            // eslint-disable-next-line
            const snippet = transactions.slice(0, 50).map((t: any, i: number) => {
                // Smart Column Detection
                const dateKey = findKey(t, ['date', 'time', 'posted']);
                const descKey = findKey(t, ['description', 'desc', 'memo', 'merchant', 'payee', 'details', 'narrative', 'transaction']);
                const amountKey = findKey(t, ['amount', 'debit', 'cost', 'value']);

                const date = dateKey ? t[dateKey] : 'Unknown Date';
                const desc = descKey ? t[descKey] : 'Unknown Description';
                const amount = amountKey ? t[amountKey] : '';

                return `${date} - ${desc} ${amount ? `(${amount})` : ''}`;
            }).join('\n');

            const content = `
                **Goal:** Identify potential SaaS or Software Subscriptions.

                **Instructions:**
                1. **Consolidate:** If the same service appears multiple times (e.g. "Spotify Jan", "Spotify Feb"), group them into ONE subscription entry. Use the **latest** date and cost.
                2. **Pattern Matching:** Look for patterns in descriptions like "Jan 2025", "Feb 2025" or "Cycle" to confirm recurrence.
                
                Return a raw JSON array (no markdown) of objects:
                - name: string (inferred application name)
                - category: string (inferred category)
                - cost: number (estimated monthly cost)
                - last_transaction_date: string (ISO date YYYY-MM-DD or 2025-01-01 if unknown)
                - confidence: number (0.0 to 1.0)
                - reasoning: string (mention if recurring pattern was found)

                Only include items with confidence > 0.5.
            `;

            const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "HTTP-Referer": SITE_URL,
                    "X-Title": SITE_NAME,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content }]
                })
            });

            if (!aiResponse.ok) {
                return NextResponse.json({ error: 'Failed to call AI provider' }, { status: 502 });
            }

            const json = await aiResponse.json();
            const aiContent = json.choices[0].message.content;

            // Clean markdown code blocks if present
            const cleanJson = aiContent.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                parsedData = JSON.parse(cleanJson);
            } catch {
                return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
            }
        } else {
            return NextResponse.json({ error: 'Invalid input: Provide transactions (CSV) or images (PDF)' }, { status: 400 });
        }

        return NextResponse.json({ candidates: parsedData });

    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
