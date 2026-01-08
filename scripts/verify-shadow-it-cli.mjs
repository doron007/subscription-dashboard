
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.0-flash-001";

// Prompt should match route.ts EXACTLY
const PROMPT_TEXT = `
You are a financial analyst AI. Look at the attached Bank Statement or Invoice images. 

**Goal:** Identify ALL recurring software/SaaS subscriptions (e.g. Netflix, Adobe, Github, AWS, Slack, Azure).

**Critical Instructions for Grouping:**
1. **Consolidate by Provider:** If there are multiple line items for the SAME provider (e.g. valid "Azure" resources, or multiple "Github" seats), group them into a SINGLE subscription entry.
2. **Find the Total:** If the document is an invoice with multiple lines, find the **TOTAL** amount due and use that as the cost.
3. **Extract Line Items:** Include a \`line_items\` array containing the individual line items that were consolidated.

Return a raw JSON array (no markdown) of objects with these fields:
- name: string (inferred application name, e.g. "Microsoft Azure")
- category: string (inferred category, e.g. "Cloud Infrastructure")
- cost: number (exact TOTAL cost from the statement/invoice, assume monthly)
- last_transaction_date: string (ISO date YYYY-MM-DD, inferred from context. If year is missing, use 2025)
- confidence: number (0.0 to 1.0)
- reasoning: string (briefly explain why, e.g. "Consolidated 5 line items for Azure")
- line_items: array of objects { "description": string, "cost": number, "date": string }

Focus on "Amount", "Description", "Total" and "Date" columns visually.
Only include items with confidence > 0.5.
`;

async function main() {
    const pdfPath = process.argv[2];
    if (!pdfPath) {
        console.error("Usage: node scripts/verify-shadow-it-cli.mjs <pdf_path>");
        process.exit(1);
    }

    if (!fs.existsSync(pdfPath)) {
        console.error(`File not found: ${pdfPath}`);
        process.exit(1);
    }

    if (!OPENROUTER_API_KEY) {
        console.error("Error: OPENROUTER_API_KEY env var not set.");
        process.exit(1);
    }

    console.log(`Processing ${pdfPath}...`);

    // 1. Convert PDF to Image (PNG) using 'sips' (Mac built-in)
    // sips -s format png input.pdf --out output.png
    // Note: sips might only do first page or handle multipage differently. 
    // Let's try to do just the first page for now as a test, or assume single page invoice.

    const tmpImg = `temp_check_${Date.now()}.jpg`;

    try {
        // -s format jpeg
        execSync(`sips -s format jpeg "${pdfPath}" --out "${tmpImg}"`, { stdio: 'inherit' });
    } catch (e) {
        console.error("Failed to convert PDF with sips:", e.message);
        process.exit(1);
    }

    // 2. Read as Base64
    const imgBuffer = fs.readFileSync(tmpImg);
    const base64Image = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

    // cleanup
    fs.unlinkSync(tmpImg);

    // 3. Call OpenRouter
    console.log("Sending to OpenRouter...");

    const body = {
        model: MODEL,
        messages: [
            {
                role: 'user',
                content: [
                    { type: "text", text: PROMPT_TEXT },
                    { type: "image_url", image_url: { url: base64Image } }
                ]
            }
        ]
    };

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Shadow IT CLI Test"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            console.error("API Error:", await response.text());
            process.exit(1);
        }

        const json = await response.json();
        const content = json.choices[0].message.content;

        console.log("\n--- AI RESPONSE ---");
        console.log(content);
        console.log("-------------------\n");

        // Parse Check
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        console.log("Parsed Candidates:", JSON.stringify(parsed, null, 2));

    } catch (e) {
        console.error("Request/Parse failed:", e);
    }
}

main();
