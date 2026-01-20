'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    X, AlertTriangle, CheckCircle2, Plus, RefreshCw, Minus, FileText,
    ChevronDown, ChevronRight, Loader2, AlertCircle, Check
} from 'lucide-react';
import type { ImportAnalysis, InvoiceDiff, LineItemDiff, MergeStrategy, ImportDecision, ImportAction, LineItemAction, VoidedAction, ImportExecutionResult } from '@/lib/import/types';

interface ImportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    analysis: ImportAnalysis | null;
    csvData: any[];
    onExecute: (decisions: ImportDecision[], globalStrategy: MergeStrategy) => Promise<void>;
}

// Batch processing configuration
const BATCH_SIZE = 50; // Process 50 invoices per batch to stay well under timeout

// Badge component for diff types
function DiffBadge({ type }: { type: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        NEW: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'New' },
        CHANGED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Changed' },
        UNCHANGED: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Unchanged' },
        REMOVED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Removed' },
        VOIDED: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending' }
    };

    const { bg, text, label } = config[type] || config.UNCHANGED;

    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
            {label}
        </span>
    );
}

// Format currency
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Line item row component
function LineItemRow({
    item,
    isSelected,
    onToggle
}: {
    item: LineItemDiff;
    isSelected: boolean;
    onToggle: () => void;
}) {
    const isSelectable = item.diffType !== 'UNCHANGED';

    return (
        <tr className={`border-b border-slate-100 text-sm ${
            item.diffType === 'UNCHANGED' ? 'opacity-50' : ''
        }`}>
            <td className="py-2 px-3">
                {isSelectable && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onToggle}
                        className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                )}
            </td>
            <td className="py-2 px-3">
                <DiffBadge type={item.diffType} />
            </td>
            <td className="py-2 px-3 max-w-xs">
                <div className="truncate" title={item.description}>
                    {item.description}
                </div>
            </td>
            <td className="py-2 px-3 text-center">
                {item.diffType === 'CHANGED' && item.existing && item.incoming ? (
                    <div className="flex items-center justify-center gap-1">
                        <span className="line-through text-slate-400">{item.existing.quantity}</span>
                        <span className="text-amber-600">→</span>
                        <span className="font-medium">{item.incoming.quantity}</span>
                    </div>
                ) : (
                    item.incoming?.quantity || item.existing?.quantity || '-'
                )}
            </td>
            <td className="py-2 px-3 text-right">
                {item.diffType === 'CHANGED' && item.existing && item.incoming ? (
                    <div className="flex items-center justify-end gap-1">
                        <span className="line-through text-slate-400">
                            {formatCurrency(item.existing.totalAmount)}
                        </span>
                        <span className="text-amber-600">→</span>
                        <span className="font-medium">
                            {formatCurrency(item.incoming.totalAmount)}
                        </span>
                    </div>
                ) : (
                    formatCurrency(item.incoming?.totalAmount || item.existing?.totalAmount || 0)
                )}
            </td>
        </tr>
    );
}

// Invoice section component
function InvoiceSection({
    invoice,
    isExpanded,
    onToggleExpand,
    selectedItems,
    onToggleItem,
    onSelectAllItems,
    voidedAction,
    onVoidedActionChange
}: {
    invoice: InvoiceDiff;
    isExpanded: boolean;
    onToggleExpand: () => void;
    selectedItems: Set<string>;
    onToggleItem: (key: string) => void;
    onSelectAllItems: (select: boolean) => void;
    voidedAction: VoidedAction;
    onVoidedActionChange: (action: VoidedAction) => void;
}) {
    const selectableItems = invoice.lineItemDiffs.filter(item => item.diffType !== 'UNCHANGED');
    const allSelected = selectableItems.length > 0 &&
        selectableItems.every(item => selectedItems.has(item.lineItemKey));
    const someSelected = selectableItems.some(item => selectedItems.has(item.lineItemKey));
    const isPending = invoice.diffType === 'VOIDED';

    return (
        <div className="border border-slate-200 rounded-lg mb-3 overflow-hidden">
            {/* Invoice header */}
            <div
                className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 ${
                    isPending ? 'bg-orange-50' : 'bg-white'
                }`}
                onClick={onToggleExpand}
            >
                <button className="text-slate-400">
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>

                <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={(e) => {
                        e.stopPropagation();
                        onSelectAllItems(!allSelected);
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    disabled={selectableItems.length === 0}
                />

                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-800">#{invoice.invoiceNumber}</span>
                        <DiffBadge type={invoice.diffType} />
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">
                        {invoice.vendor} &bull; {invoice.incoming?.invoiceDate || invoice.existing?.invoiceDate}
                    </div>
                </div>

                <div className="text-right">
                    <div className="font-semibold text-slate-800">
                        {formatCurrency(invoice.incoming?.totalAmount || invoice.existing?.totalAmount || 0)}
                    </div>
                    <div className="text-xs text-slate-500">
                        {invoice.stats.newLineItems > 0 && (
                            <span className="text-emerald-600 mr-2">+{invoice.stats.newLineItems} new</span>
                        )}
                        {invoice.stats.changedLineItems > 0 && (
                            <span className="text-amber-600 mr-2">{invoice.stats.changedLineItems} changed</span>
                        )}
                        {invoice.stats.removedLineItems > 0 && (
                            <span className="text-red-600">{invoice.stats.removedLineItems} removed</span>
                        )}
                    </div>
                </div>

                {/* Pending invoice action selector */}
                {isPending && (
                    <div className="ml-2" onClick={(e) => e.stopPropagation()}>
                        <select
                            value={voidedAction}
                            onChange={(e) => onVoidedActionChange(e.target.value as VoidedAction)}
                            className="text-xs border border-orange-200 bg-orange-50 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                            <option value="import_unpaid">Import as Unpaid</option>
                            <option value="skip">Skip (Don't Import)</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Line items table */}
            {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50/50">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-100/50">
                                <th className="py-2 px-3 w-10"></th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 w-24">Status</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600">Description</th>
                                <th className="py-2 px-3 text-center text-xs font-semibold text-slate-600 w-24">Qty</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-slate-600 w-32">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.lineItemDiffs.map((item) => (
                                <LineItemRow
                                    key={item.lineItemKey}
                                    item={item}
                                    isSelected={selectedItems.has(item.lineItemKey)}
                                    onToggle={() => onToggleItem(item.lineItemKey)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export function ImportPreviewModal({
    isOpen,
    onClose,
    analysis,
    csvData,
    onExecute
}: ImportPreviewModalProps) {
    const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
    const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
    const [globalStrategy, setGlobalStrategy] = useState<MergeStrategy>('csv_wins');
    const [isExecuting, setIsExecuting] = useState(false);
    const [filterType, setFilterType] = useState<'all' | 'changes'>('changes');
    // Track voided action per invoice (default: import_unpaid)
    const [voidedActions, setVoidedActions] = useState<Record<string, VoidedAction>>({});

    // Batch processing progress state
    const [importProgress, setImportProgress] = useState({
        currentBatch: 0,
        totalBatches: 0,
        processedItems: 0,
        totalItems: 0,
        results: null as ImportExecutionResult | null,
        errors: [] as string[]
    });

    // Initialize selections when analysis changes
    useMemo(() => {
        if (!analysis) return;

        // Auto-select all new/changed/pending items
        const initialSelected = new Set<string>();
        for (const invoice of analysis.invoiceDiffs) {
            for (const item of invoice.lineItemDiffs) {
                // Select NEW, CHANGED, and VOIDED (pending) items by default
                if (item.diffType === 'NEW' || item.diffType === 'CHANGED' || item.diffType === 'VOIDED') {
                    initialSelected.add(item.lineItemKey);
                }
            }
        }
        setSelectedLineItems(initialSelected);

        // Auto-expand invoices with changes
        const initialExpanded = new Set<string>();
        for (const invoice of analysis.invoiceDiffs) {
            if (invoice.diffType !== 'UNCHANGED') {
                initialExpanded.add(invoice.invoiceNumber);
            }
        }
        setExpandedInvoices(initialExpanded);

        // Initialize voided actions (default: import_unpaid)
        const initialVoidedActions: Record<string, VoidedAction> = {};
        for (const invoice of analysis.invoiceDiffs) {
            if (invoice.diffType === 'VOIDED') {
                initialVoidedActions[invoice.invoiceNumber] = invoice.voidedAction || 'import_unpaid';
            }
        }
        setVoidedActions(initialVoidedActions);
    }, [analysis?.analyzedAt]);

    // Filter invoices based on filter type
    const filteredInvoices = useMemo(() => {
        if (!analysis) return [];
        if (filterType === 'all') return analysis.invoiceDiffs;
        return analysis.invoiceDiffs.filter(inv => inv.diffType !== 'UNCHANGED');
    }, [analysis, filterType]);

    // Toggle invoice expansion
    const toggleInvoiceExpand = (invoiceNumber: string) => {
        setExpandedInvoices(prev => {
            const next = new Set(prev);
            if (next.has(invoiceNumber)) {
                next.delete(invoiceNumber);
            } else {
                next.add(invoiceNumber);
            }
            return next;
        });
    };

    // Toggle single line item selection
    const toggleLineItem = (key: string) => {
        setSelectedLineItems(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // Toggle all items in an invoice
    const toggleAllInvoiceItems = (invoiceNumber: string, select: boolean) => {
        const invoice = analysis?.invoiceDiffs.find(inv => inv.invoiceNumber === invoiceNumber);
        if (!invoice) return;

        setSelectedLineItems(prev => {
            const next = new Set(prev);
            for (const item of invoice.lineItemDiffs) {
                // Include VOIDED items as selectable
                if (item.diffType !== 'UNCHANGED') {
                    if (select) {
                        next.add(item.lineItemKey);
                    } else {
                        next.delete(item.lineItemKey);
                    }
                }
            }
            return next;
        });
    };

    // Change voided action for an invoice
    const handleVoidedActionChange = (invoiceNumber: string, action: VoidedAction) => {
        setVoidedActions(prev => ({
            ...prev,
            [invoiceNumber]: action
        }));

        // If changing to skip, deselect all items in that invoice
        // If changing to import_unpaid, select all items
        const invoice = analysis?.invoiceDiffs.find(inv => inv.invoiceNumber === invoiceNumber);
        if (invoice) {
            setSelectedLineItems(prev => {
                const next = new Set(prev);
                for (const item of invoice.lineItemDiffs) {
                    if (action === 'skip') {
                        next.delete(item.lineItemKey);
                    } else {
                        next.add(item.lineItemKey);
                    }
                }
                return next;
            });
        }
    };

    // Build decisions and execute import with batching
    const handleExecute = async () => {
        if (!analysis) return;

        setIsExecuting(true);

        // Build decisions based on selections
        const decisions: ImportDecision[] = analysis.invoiceDiffs.map(invoice => {
            const lineItemDecisions = invoice.lineItemDiffs.map(item => ({
                lineItemKey: item.lineItemKey,
                action: (selectedLineItems.has(item.lineItemKey) ? 'import' : 'skip') as LineItemAction,
                mergeStrategy: globalStrategy
            }));

            const hasSelectedItems = invoice.lineItemDiffs.some(
                item => selectedLineItems.has(item.lineItemKey)
            );

            return {
                invoiceNumber: invoice.invoiceNumber,
                action: (hasSelectedItems ? 'import' : 'skip') as ImportAction,
                mergeStrategy: globalStrategy,
                lineItemDecisions
            };
        });

        // Calculate total batches based on CSV data
        const totalItems = csvData.length;
        const totalBatches = Math.ceil(totalItems / BATCH_SIZE);

        // Reset progress
        setImportProgress({
            currentBatch: 0,
            totalBatches,
            processedItems: 0,
            totalItems,
            results: null,
            errors: []
        });

        // Aggregate results across batches
        const aggregatedResults: ImportExecutionResult = {
            success: true,
            created: { vendors: 0, invoices: 0, lineItems: 0, services: 0 },
            updated: { invoices: 0, lineItems: 0 },
            skipped: { invoices: 0, lineItems: 0 },
            errors: []
        };

        try {
            // Process each batch sequentially
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                setImportProgress(prev => ({
                    ...prev,
                    currentBatch: batchIndex + 1
                }));

                const response = await fetch('/api/import/execute-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        csvData,
                        decisions,
                        globalStrategy,
                        batchIndex,
                        batchSize: BATCH_SIZE,
                        totalBatches
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.details || error.error || `Batch ${batchIndex + 1} failed`);
                }

                const batchResult = await response.json();

                // Aggregate results
                aggregatedResults.created.vendors += batchResult.created.vendors;
                aggregatedResults.created.invoices += batchResult.created.invoices;
                aggregatedResults.created.lineItems += batchResult.created.lineItems;
                aggregatedResults.created.services += batchResult.created.services;
                aggregatedResults.updated.invoices += batchResult.updated.invoices;
                aggregatedResults.updated.lineItems += batchResult.updated.lineItems;
                aggregatedResults.skipped.invoices += batchResult.skipped.invoices;
                aggregatedResults.skipped.lineItems += batchResult.skipped.lineItems;
                aggregatedResults.errors.push(...(batchResult.errors || []));

                // Update progress
                const processedItems = Math.min((batchIndex + 1) * BATCH_SIZE, totalItems);
                setImportProgress(prev => ({
                    ...prev,
                    processedItems,
                    results: { ...aggregatedResults },
                    errors: aggregatedResults.errors
                }));
            }

            aggregatedResults.success = aggregatedResults.errors.length === 0;

            // Show completion message
            const message = [
                `Import completed!`,
                `Created: ${aggregatedResults.created.invoices} invoices, ${aggregatedResults.created.lineItems} line items`,
                `Updated: ${aggregatedResults.updated.invoices} invoices`,
                `Skipped: ${aggregatedResults.skipped.invoices} invoices`,
                aggregatedResults.errors.length > 0 ? `Errors: ${aggregatedResults.errors.length}` : ''
            ].filter(Boolean).join('\n');

            alert(message);

            // Call original onExecute to handle cleanup (close modal, refresh, etc.)
            // Pass empty decisions since we already processed
            await onExecute([], globalStrategy);

        } catch (error) {
            console.error('Batch import error:', error);
            alert(`Import failed: ${(error as Error).message}`);
        } finally {
            setIsExecuting(false);
            setImportProgress({
                currentBatch: 0,
                totalBatches: 0,
                processedItems: 0,
                totalItems: 0,
                results: null,
                errors: []
            });
        }
    };

    if (!isOpen) return null;

    // Calculate selection stats
    const totalSelectable = analysis?.invoiceDiffs.reduce(
        (sum, inv) => sum + inv.lineItemDiffs.filter(item => item.diffType !== 'UNCHANGED').length,
        0
    ) || 0;
    const selectedCount = selectedLineItems.size;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />

            <div className="relative min-h-screen flex items-center justify-center p-4">
                <div className="relative bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-800">Import Preview</h2>
                            <p className="text-sm text-slate-500">
                                {analysis?.filename} &bull; {analysis?.summary.totalInvoices} invoices, {analysis?.summary.totalLineItems} line items
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>

                    {/* Summary cards */}
                    {analysis && (
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <div className="grid grid-cols-5 gap-3">
                                <div className="bg-white p-3 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 text-emerald-600 mb-1">
                                        <Plus className="w-4 h-4" />
                                        <span className="text-xs font-medium">New</span>
                                    </div>
                                    <div className="text-xl font-bold text-slate-800">
                                        {analysis.summary.newInvoices}
                                    </div>
                                    <div className="text-xs text-slate-500">invoices</div>
                                </div>

                                <div className="bg-white p-3 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 text-amber-600 mb-1">
                                        <RefreshCw className="w-4 h-4" />
                                        <span className="text-xs font-medium">Updated</span>
                                    </div>
                                    <div className="text-xl font-bold text-slate-800">
                                        {analysis.summary.updatedInvoices}
                                    </div>
                                    <div className="text-xs text-slate-500">invoices</div>
                                </div>

                                <div className="bg-white p-3 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                                        <Check className="w-4 h-4" />
                                        <span className="text-xs font-medium">Unchanged</span>
                                    </div>
                                    <div className="text-xl font-bold text-slate-800">
                                        {analysis.summary.unchangedInvoices}
                                    </div>
                                    <div className="text-xs text-slate-500">invoices</div>
                                </div>

                                <div className="bg-white p-3 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 text-orange-600 mb-1">
                                        <AlertCircle className="w-4 h-4" />
                                        <span className="text-xs font-medium">Pending</span>
                                    </div>
                                    <div className="text-xl font-bold text-slate-800">
                                        {analysis.summary.voidedInvoices}
                                    </div>
                                    <div className="text-xs text-slate-500">invoices</div>
                                </div>

                                <div className="bg-white p-3 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 text-violet-600 mb-1">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-xs font-medium">Selected</span>
                                    </div>
                                    <div className="text-xl font-bold text-slate-800">
                                        {selectedCount}/{totalSelectable}
                                    </div>
                                    <div className="text-xs text-slate-500">line items</div>
                                </div>
                            </div>

                            {/* Warnings */}
                            {analysis.warnings.length > 0 && (
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <div className="text-sm font-medium text-amber-800">Warnings</div>
                                            <ul className="text-sm text-amber-700 mt-1 space-y-1">
                                                {analysis.warnings.slice(0, 5).map((warning, i) => (
                                                    <li key={i}>{warning}</li>
                                                ))}
                                                {analysis.warnings.length > 5 && (
                                                    <li className="text-amber-600">
                                                        ...and {analysis.warnings.length - 5} more
                                                    </li>
                                                )}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Filter and strategy controls */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">Show:</span>
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as 'all' | 'changes')}
                                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="changes">Changes Only</option>
                                <option value="all">All Invoices</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">When data differs:</span>
                            <select
                                value={globalStrategy}
                                onChange={(e) => setGlobalStrategy(e.target.value as MergeStrategy)}
                                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="csv_wins">Use CSV Values</option>
                                <option value="keep_existing">Keep Existing</option>
                                <option value="skip">Skip Conflicts</option>
                            </select>
                        </div>
                    </div>

                    {/* Invoice list */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {filteredInvoices.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                                <p className="font-medium">No changes detected</p>
                                <p className="text-sm mt-1">All invoice data matches existing records.</p>
                            </div>
                        ) : (
                            filteredInvoices.map((invoice) => (
                                <InvoiceSection
                                    key={invoice.invoiceNumber}
                                    invoice={invoice}
                                    isExpanded={expandedInvoices.has(invoice.invoiceNumber)}
                                    onToggleExpand={() => toggleInvoiceExpand(invoice.invoiceNumber)}
                                    selectedItems={selectedLineItems}
                                    onToggleItem={toggleLineItem}
                                    onSelectAllItems={(select) => toggleAllInvoiceItems(invoice.invoiceNumber, select)}
                                    voidedAction={voidedActions[invoice.invoiceNumber] || 'import_unpaid'}
                                    onVoidedActionChange={(action) => handleVoidedActionChange(invoice.invoiceNumber, action)}
                                />
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex flex-col border-t border-slate-200 bg-slate-50">
                        {/* Progress bar during import */}
                        {isExecuting && importProgress.totalBatches > 0 && (
                            <div className="p-4 border-b border-slate-200 bg-violet-50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-violet-800">
                                        Importing batch {importProgress.currentBatch} of {importProgress.totalBatches}
                                    </span>
                                    <span className="text-sm text-violet-600">
                                        {Math.round((importProgress.processedItems / importProgress.totalItems) * 100)}%
                                    </span>
                                </div>
                                <div className="w-full bg-violet-200 rounded-full h-2.5">
                                    <div
                                        className="bg-violet-600 h-2.5 rounded-full transition-all duration-300"
                                        style={{ width: `${(importProgress.processedItems / importProgress.totalItems) * 100}%` }}
                                    />
                                </div>
                                {importProgress.results && (
                                    <div className="mt-2 text-xs text-violet-700">
                                        Created: {importProgress.results.created.invoices} invoices, {importProgress.results.created.lineItems} line items
                                        {importProgress.errors.length > 0 && (
                                            <span className="text-red-600 ml-2">
                                                ({importProgress.errors.length} errors)
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex items-center justify-between p-4">
                            <div className="text-sm text-slate-500">
                                {selectedCount} items selected for import
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    disabled={isExecuting}
                                    className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleExecute}
                                    disabled={selectedCount === 0 || isExecuting}
                                    className="px-4 py-2 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isExecuting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Importing...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Import Selected ({selectedCount})
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
