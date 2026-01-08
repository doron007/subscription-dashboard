import { extractRawInvoiceData } from './extraction';
import { aggregateInvoice } from './aggregation';
import { AggregatedSubscription, PipelineContext } from './types';
import { v4 as uuidv4 } from 'uuid';

export interface PipelineResult {
    success: boolean;
    data?: AggregatedSubscription;
    context: PipelineContext;
    error?: string;
}

export async function runInvoiceAnalysisPipeline(images: string[]): Promise<PipelineResult> {
    const context: PipelineContext = {
        id: uuidv4(),
        logs: [],
        steps: []
    };

    const log = (msg: string) => context.logs.push(`[${new Date().toISOString()}] ${msg}`);

    try {
        log(`Starting Pipeline with ${images.length} images`);

        // Step 1: Raw Extraction
        const startExtract = Date.now();
        log("Step 1: Requesting Raw Extraction from AI...");
        const rawData = await extractRawInvoiceData(images);

        context.steps.push({
            name: "Raw Extraction",
            status: "success",
            duration_ms: Date.now() - startExtract,
            details: { raw_line_items_count: rawData.line_items.length, raw_total: rawData.total_amount }
        });
        log(`Extracted ${rawData.line_items.length} raw line items. Vendor: ${rawData.vendor_name}`);

        // Step 2: Aggregation
        const startAgg = Date.now();
        log("Step 2: Running Aggregation Logic...");
        const aggregatedData = aggregateInvoice(rawData);

        context.steps.push({
            name: "Aggregation",
            status: "success",
            duration_ms: Date.now() - startAgg,
            details: {
                original_count: rawData.line_items.length,
                final_count: aggregatedData.line_items.length
            }
        });
        log(`Aggregation complete. Reduced to ${aggregatedData.line_items.length} consolidated items.`);

        return {
            success: true,
            data: aggregatedData,
            context
        };

    } catch (error) {
        const errMsg = (error as Error).message;
        log(`Pipeline Failed: ${errMsg}`);
        return {
            success: false,
            context,
            error: errMsg
        };
    }
}
