console.log("DEBUG: Script starting...");
import { runInvoiceAnalysisPipeline } from '../src/lib/analysis/pipeline';
import { convertPdfToImagesNode } from './pdf-converter';
import fs from 'fs';
import path from 'path';

console.log("DEBUG: Imports loaded.");

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: npx tsx scripts/test-invoice-analysis.ts <path-to-pdf>");
        process.exit(1);
    }

    const filePath = path.resolve(args[0]);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`\n--- TEST RUN: ${path.basename(filePath)} ---`);
    console.log(`1. Converting PDF to Images...`);

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const images = await convertPdfToImagesNode(fileBuffer);

        console.log(`   Generated ${images.length} images.`);

        console.log(`2. Running Analysis Pipeline...`);
        const result = await runInvoiceAnalysisPipeline(images);

        if (result.success && result.data) {
            console.log(`\n✅ PIPELINE SUCCESS`);
            console.log(`Vendor: ${result.data.vendor.name}`);
            console.log(`Invoice #: ${result.data.invoice.number}`);
            console.log(`Total: ${result.data.invoice.total_amount} ${result.data.invoice.currency}`);
            console.log(`Items: ${result.data.line_items.length}`);

            console.log(`\n--- Line Items Preview ---`);
            result.data.line_items.forEach(item => {
                console.log(` - [${item.service_name}] ${item.description.substring(0, 30)}... | Qty: ${item.quantity} | Unit: ${item.unit_price} | Total: ${item.total_amount}`);
            });

            console.log(`\n--- Debug Logs ---`);
            console.log(JSON.stringify(result.context.steps, null, 2));
        } else {
            console.error(`\n❌ PIPELINE FAILED`);
            console.error(result.error);
            console.error(JSON.stringify(result.context.logs, null, 2));
        }

    } catch (err) {
        console.error("Test Script Error:", err);
    }
}

main();
