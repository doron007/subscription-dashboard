import { RawInvoice } from './types';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SITE_NAME = 'Subscription Dashboard';

export async function extractRawInvoiceData(images: string[]): Promise<RawInvoice> {
    if (!OPENROUTER_API_KEY) {
        throw new Error("Missing OpenRouter API Key");
    }

    const prompt = `
        You are a Data Entry Clerk.
        **Goal:** Transcribe this invoice EXACTLY as it appears. Do not summarize. Do not apply group logic.

        **Fields to Extract:**
        1. Vendor Name - Extract the FULL OFFICIAL company name exactly as shown on the invoice letterhead/header.
           Include "Inc", "LLC", "Corp", "Ltd" or similar suffixes if present.
           Use the complete name (e.g., "Pinnacle Business Systems" NOT just "Pinnacle").
           Look for the company name in the logo area, header, or "From:" section.
        2. Invoice Date (YYYY-MM-DD)
        3. Invoice Number
        4. Total Amount (Grand Total)
        5. Currency (USD, EUR, etc)
        6. Line Items (Every single row in the table)
           - Description (Exact text)
           - Quantity
           - Unit Price
           - Total Line Amount

        **Return JSON Only:**
        {
            "vendor_name": "string (FULL official company name)",
            "invoice_date": "YYYY-MM-DD",
            "invoice_number": "string",
            "total_amount": 0.00,
            "currency": "USD",
            "confidence_score": 0.95,
            "line_items": [
                { "description": "...", "quantity": 1, "unit_price": 10.00, "total": 10.00 }
            ]
        }
    `;

    const content = [
        {
            type: "text",
            text: prompt
        },
        ...images.map(img => ({
            type: "image_url",
            image_url: {
                url: img // Expecting base64 data URL
            }
        }))
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": SITE_URL,
            "X-Title": SITE_NAME,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [{ role: 'user', content }]
        })
    });

    if (!response.ok) {
        throw new Error(`AI Provider Error: ${response.statusText}`);
    }

    const json = await response.json();
    const cleanJson = json.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(cleanJson) as RawInvoice;
    } catch (e) {
        console.error("Failed to parse RAW AI response", cleanJson);
        throw new Error("Invalid JSON from AI");
    }
}
