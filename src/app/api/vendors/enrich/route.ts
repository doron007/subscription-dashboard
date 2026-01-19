import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SITE_NAME = 'Subscription Dashboard';

interface EnrichmentResult {
    website?: string;
    category?: string;
    billingCycle?: string;
}

/**
 * POST /api/vendors/enrich
 * Uses AI to suggest vendor information based on the vendor name.
 */
export async function POST(request: NextRequest) {
    // Require authentication
    const { response: authResponse } = await requireAuth();
    if (authResponse) return authResponse;

    try {
        const body = await request.json();
        const { vendorName } = body;

        if (!vendorName || typeof vendorName !== 'string') {
            return NextResponse.json(
                { error: 'vendorName is required' },
                { status: 400 }
            );
        }

        if (!OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: 'AI service not configured' },
                { status: 503 }
            );
        }

        const prompt = `You are a business research assistant. Given the following vendor/company name, provide information about the company.

Vendor Name: "${vendorName}"

Return ONLY a valid JSON object with the following fields (use null for fields you cannot determine with confidence):

{
    "website": "The official company website URL (e.g., 'microsoft.com' or 'salesforce.com'). Do not include https://",
    "category": "The primary business category. Choose one of: CRM, Security, Productivity, Cloud Infrastructure, Communication, HR/Payroll, Finance/Accounting, Marketing, Development Tools, IT Management, Data Analytics, ERP, Legal, Project Management, Design, Other",
    "billingCycle": "The typical billing cycle for this vendor's products: 'Monthly', 'Annual', 'Quarterly', or 'As Needed'"
}

Important:
- Only provide information you are confident about
- For website, provide just the domain without https:// prefix
- Return ONLY the JSON object, no markdown or explanation`;

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
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3, // Lower temperature for more factual responses
            })
        });

        if (!response.ok) {
            console.error('OpenRouter API error:', response.status, response.statusText);
            return NextResponse.json(
                { error: 'AI service temporarily unavailable' },
                { status: 503 }
            );
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;

        if (!content) {
            return NextResponse.json(
                { error: 'No response from AI' },
                { status: 500 }
            );
        }

        // Clean up the response - remove markdown code blocks if present
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const result = JSON.parse(cleanJson) as EnrichmentResult;

            // Normalize the response - filter out null values
            const normalizedResult: EnrichmentResult = {};

            if (result.website && result.website !== 'null') {
                // Clean up website - remove https:// if present
                normalizedResult.website = result.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
            }

            if (result.category && result.category !== 'null') {
                normalizedResult.category = result.category;
            }

            if (result.billingCycle && result.billingCycle !== 'null') {
                normalizedResult.billingCycle = result.billingCycle;
            }

            return NextResponse.json(normalizedResult);
        } catch (parseError) {
            console.error('Failed to parse AI response:', cleanJson);
            return NextResponse.json(
                { error: 'Invalid response from AI' },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Vendor enrichment error:', error);
        return NextResponse.json(
            { error: 'Failed to enrich vendor data' },
            { status: 500 }
        );
    }
}
