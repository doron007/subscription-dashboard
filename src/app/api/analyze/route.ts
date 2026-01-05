import { NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SITE_NAME = 'Subscription Dashboard';

export async function POST(request: Request) {
    if (!OPENROUTER_API_KEY) {
        return NextResponse.json({ error: 'OpenRouter API Key not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { transactions, images } = body;

        let messages;
        // Vision capable models: google/gemini-flash-1.5, openai/gpt-4o
        // We defaults to gemini-2.0-flash-001 for speed/cost/vision
        let model = "google/gemini-2.0-flash-001";

        if (images && Array.isArray(images)) {
            // VISION PATH
            console.log(`Processing ${images.length} images...`);
            const content = [
                {
                    type: "text",
                    text: `
                        You are a financial analyst AI. Look at the attached Bank Statement images. 
                        Identify all recursive software/SaaS subscriptions (e.g. Netflix, Adobe, Github, AWS, Slack).
                        
                        Ignore one-off purchases like restaurants or retail, unless it looks like a recurring software bill.
                        
                        Return a raw JSON array (no markdown) of objects with these fields:
                        - name: string (inferred application name, e.g. "Github")
                        - category: string (inferred category, e.g. "Developer Tools")
                        - cost: number (exact cost from the statement, assume monthly)
                        - last_transaction_date: string (ISO date YYYY-MM-DD from the row, inferred from context if year is missing use 2025)
                        - confidence: number (0.0 to 1.0)
                        - reasoning: string (briefly why)

                        Focus on "Amount", "Description" and "Date" columns visually.
                        Only include items with confidence > 0.5.
                    `
                },
                ...images.map(img => ({
                    type: "image_url",
                    image_url: {
                        url: img // Already base64 data:image/jpeg...
                    }
                }))
            ];

            messages = [
                {
                    role: 'user',
                    content: content
                }
            ];

        } else if (transactions) {
            // TEXT PATH (Existing)
            if (!Array.isArray(transactions)) {
                return NextResponse.json({ error: 'Invalid input: transactions array required' }, { status: 400 });
            }

            // Helper to find key case-insensitively
            const findKey = (obj: any, candidates: string[]) => {
                const keys = Object.keys(obj);
                for (const candidate of candidates) {
                    const found = keys.find(k => k.toLowerCase().includes(candidate.toLowerCase()) || k.toLowerCase() === candidate.toLowerCase());
                    if (found) return found;
                }
                return null;
            };

            // Limit to first 50 transactions
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

            messages = [
                {
                    role: 'user',
                    content: `
                      You are a financial analyst AI. Analyze the following local bank transaction records.
                      
                      Transactions:
                      ${snippet}

                      Return a raw JSON array (no markdown) of objects with these fields:
                      - name: string (inferred application name)
                      - category: string (inferred category)
                      - cost: number (estimated)
                      - last_transaction_date: string (ISO date YYYY-MM-DD)
                      - confidence: number (0.0 to 1.0)
                      - reasoning: string (brief reasoning)

                      Only include items with confidence > 0.5.
                    `
                }
            ];
        } else {
            return NextResponse.json({ error: 'Invalid input: Provide transactions (CSV) or images (PDF)' }, { status: 400 });
        }

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: messages
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("OpenRouter Error:", err);
            return NextResponse.json({ error: 'Failed to call AI provider' }, { status: 502 });
        }

        const json = await response.json();
        const content = json.choices[0].message.content;

        // clean markdown code blocks if present
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();

        let parsedData;
        try {
            parsedData = JSON.parse(cleanJson);
        } catch (e) {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        return NextResponse.json({ candidates: parsedData });

    } catch (error) {
        console.error('Analysis Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
