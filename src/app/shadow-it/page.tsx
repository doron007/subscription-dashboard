'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { aiService, type AnalyzedSubscription } from '@/services/aiService';
import { subscriptionService } from '@/services/subscriptionService';
import { convertPdfToImages } from '@/lib/pdfUtils';
import type { Subscription } from '@/types';
import type { ImportAnalysis, ImportDecision, MergeStrategy, ImportExecutionResult } from '@/lib/import/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ImportPreviewModal } from '@/components/modals/ImportPreviewModal';
import { Upload, Sparkles, AlertTriangle, CheckCircle, Loader2, Plus, FileSpreadsheet, ScanSearch } from 'lucide-react';

// Main wrapper component with Suspense for useSearchParams
export default function ShadowItPage() {
    return (
        <Suspense fallback={<DashboardLayout><div className="max-w-4xl mx-auto p-8 text-center text-slate-500">Loading...</div></DashboardLayout>}>
            <ShadowItContent />
        </Suspense>
    );
}

type TabType = 'scan' | 'import';

function ShadowItContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Tab state
    const [activeTab, setActiveTab] = useState<TabType>('scan');

    // Device scan refs and state
    const scanFileInputRef = useRef<HTMLInputElement>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [results, setResults] = useState<AnalyzedSubscription[]>([]);
    const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
    const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Duplicate Detection State
    const [existingSubscriptions, setExistingSubscriptions] = useState<Subscription[]>([]);
    const [conflictSub, setConflictSub] = useState<{ existing: Subscription, new: AnalyzedSubscription, index: number } | null>(null);

    // Invoice import refs and state
    const invoiceImportRef = useRef<HTMLInputElement>(null);
    const [analyzingInvoices, setAnalyzingInvoices] = useState(false);
    const [invoiceAnalysis, setInvoiceAnalysis] = useState<ImportAnalysis | null>(null);
    const [invoiceCsvData, setInvoiceCsvData] = useState<any[]>([]);
    const [showImportPreview, setShowImportPreview] = useState(false);
    const [invoiceIsDragging, setInvoiceIsDragging] = useState(false);

    // Load existing subscriptions on mount
    useEffect(() => {
        subscriptionService.getAll().then(setExistingSubscriptions).catch(console.error);
    }, []);

    // AutoLoad Logic: Load test PDF when ?autoLoad=true is in URL
    useEffect(() => {
        const autoLoad = searchParams.get('autoLoad');
        if (autoLoad === 'true' && !autoLoadTriggered && !analyzing && results.length === 0) {
            setAutoLoadTriggered(true);
            console.log('[AutoLoad] Fetching test_invoice.pdf...');

            fetch('/test_invoice.pdf')
                .then(response => {
                    if (!response.ok) throw new Error('Failed to fetch test PDF');
                    return response.blob();
                })
                .then(blob => {
                    const file = new File([blob], 'test_invoice.pdf', { type: 'application/pdf' });
                    console.log('[AutoLoad] Processing test_invoice.pdf...');
                    processFiles([file]);
                })
                .catch(error => {
                    console.error('[AutoLoad] Error:', error);
                    alert('AutoLoad failed: ' + error.message);
                });
        }
    }, [searchParams, autoLoadTriggered, analyzing, results.length]);

    // ========== DEVICE SCAN HANDLERS ==========
    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            processFiles(Array.from(files));
        }
    };

    const processFiles = async (files: File[]) => {
        if (!files || files.length === 0) return;

        setAnalyzing(true);
        setResults([]);

        const allImages: string[] = [];
        let csvTransactions: any[] = [];
        let hasPdf = false;
        let hasCsv = false;

        try {
            console.log(`Processing ${files.length} files...`);

            for (const file of files) {
                if (file.type === 'application/pdf') {
                    hasPdf = true;
                    try {
                        const images = await convertPdfToImages(file);
                        if (images && images.length > 0) {
                            allImages.push(...images);
                        }
                    } catch (pdfError) {
                        console.error(`PDF Error for ${file.name}:`, pdfError);
                    }
                } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                    hasCsv = true;
                    try {
                        const parsedData = await new Promise<any[]>((resolve, reject) => {
                            Papa.parse(file, {
                                header: true,
                                skipEmptyLines: true,
                                complete: (results) => resolve(results.data),
                                error: (err) => reject(err)
                            });
                        });
                        if (parsedData && parsedData.length > 0) {
                            csvTransactions.push(...parsedData);
                        }
                    } catch (csvError) {
                        console.error(`CSV Error for ${file.name}:`, csvError);
                    }
                }
            }

            if (hasPdf && allImages.length > 0) {
                console.log(`Sending ${allImages.length} images to AI...`);
                const candidates = await aiService.analyzeImages(allImages);
                setResults(candidates || []);
            } else if (hasCsv && csvTransactions.length > 0) {
                console.log(`Sending ${csvTransactions.length} transactions to AI...`);
                const candidates = await aiService.analyze(csvTransactions);
                setResults(candidates || []);
            } else {
                if (hasPdf || hasCsv) {
                    alert('Could not extract valid data from the provided files.');
                }
            }

        } catch (error) {
            console.error('Processing error:', error);
            alert(`Failed to process files: ${(error as Error).message}`);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleScanFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) processFiles(Array.from(files));
    };

    const handleAdd = async (sub: AnalyzedSubscription, index: number) => {
        const duplicate = existingSubscriptions.find(e => e.name.toLowerCase() === sub.name.toLowerCase());
        if (duplicate) {
            setConflictSub({ existing: duplicate, new: sub, index });
            return;
        }
        performAdd(sub, index);
    };

    const performAdd = async (sub: AnalyzedSubscription, index: number) => {
        setAddingIds(prev => new Set(prev).add(index));
        try {
            const isRichInvoice = sub.line_items && sub.line_items.length > 0 && sub.line_items.some(li => li.quantity !== undefined);

            if (isRichInvoice) {
                const invoiceNumber = sub.invoice_number ||
                    `INV-${(sub.last_transaction_date || '').replace(/\D/g, '')}-${Math.round(sub.cost)}`;

                const analysisPayload = {
                    vendor: {
                        name: sub.name,
                        contact_email: '',
                        website: ''
                    },
                    invoice: {
                        number: invoiceNumber,
                        date: sub.last_transaction_date || new Date().toISOString().split('T')[0],
                        total_amount: sub.cost,
                        currency: 'USD'
                    },
                    line_items: sub.line_items?.map(li => ({
                        description: li.description,
                        service_name: li.service_name || li.description,
                        quantity: li.quantity || 1,
                        unit_price: li.unit_price || li.cost,
                        total_amount: li.cost || li.total_amount,
                        period_start: null,
                        period_end: null
                    }))
                };

                await subscriptionService.createInvoice(analysisPayload);
                alert('Invoice processed and linked to dashboard!');
            } else {
                const newSubscription = await subscriptionService.create({
                    name: sub.name,
                    category: sub.category,
                    cost: sub.cost,
                    logo: `https://www.google.com/s2/favicons?domain=${sub.name.replace(/\s+/g, '').toLowerCase()}.com&sz=128`,
                    status: 'Active',
                    billingCycle: 'Monthly',
                    paymentMethod: 'Credit Card',
                    renewalDate: sub.last_transaction_date || new Date().toISOString().split('T')[0],
                    owner: { name: 'Unknown', email: 'admin@company.com' }
                });

                if (sub.line_items && sub.line_items.length > 0) {
                    for (const item of sub.line_items) {
                        await subscriptionService.addTransaction({
                            subscriptionId: newSubscription.id,
                            date: item.date || sub.last_transaction_date || new Date().toISOString().split('T')[0],
                            amount: item.cost,
                            currency: 'USD',
                            status: 'Posted',
                            description: item.description || `Initial scan via Shadow IT`
                        });
                    }
                }
            }

            setResults(prev => prev.filter((_, i) => i !== index));
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to add subscription/invoice');
        } finally {
            setAddingIds(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    const handleUpdate = async () => {
        if (!conflictSub) return;
        const { existing, new: newSub, index } = conflictSub;
        setConflictSub(null);
        setAddingIds(prev => new Set(prev).add(index));

        try {
            await subscriptionService.update(existing.id, {
                cost: newSub.cost,
                status: 'Active'
            });

            if (newSub.line_items && newSub.line_items.length > 0) {
                for (const item of newSub.line_items) {
                    await subscriptionService.addTransaction({
                        subscriptionId: existing.id,
                        date: item.date || newSub.last_transaction_date || new Date().toISOString().split('T')[0],
                        amount: item.cost,
                        currency: 'USD',
                        status: 'Posted',
                        description: item.description || `Updated via Shadow IT`
                    });
                }
            }

            const updatedList = existingSubscriptions.map(s => s.id === existing.id ? { ...s, cost: newSub.cost } : s);
            setExistingSubscriptions(updatedList);

            setResults(prev => prev.filter((_, i) => i !== index));
            router.refresh();
            alert(`Updated ${existing.name} successfully!`);
        } catch (error) {
            alert('Failed to update subscription');
        } finally {
            setAddingIds(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    // ========== INVOICE IMPORT HANDLERS ==========
    const onInvoiceDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setInvoiceIsDragging(true);
    };

    const onInvoiceDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setInvoiceIsDragging(false);
    };

    const onInvoiceDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setInvoiceIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            processInvoiceFile(files[0]);
        }
    };

    const handleInvoiceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processInvoiceFile(file);
    };

    const processInvoiceFile = async (file: File) => {
        setAnalyzingInvoices(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    setInvoiceCsvData(results.data);

                    const response = await fetch('/api/import/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            csvData: results.data,
                            filename: file.name
                        })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.details || 'Analysis failed');
                    }

                    const analysis: ImportAnalysis = await response.json();
                    setInvoiceAnalysis(analysis);
                    setShowImportPreview(true);

                } catch (error) {
                    console.error('Invoice analysis error:', error);
                    alert(`Failed to analyze invoice file: ${(error as Error).message}`);
                } finally {
                    setAnalyzingInvoices(false);
                    if (invoiceImportRef.current) invoiceImportRef.current.value = '';
                }
            },
            error: (error) => {
                console.error('CSV parse error:', error);
                setAnalyzingInvoices(false);
                alert('Error parsing CSV file');
            }
        });
    };

    const handleExecuteImport = async (decisions: ImportDecision[], globalStrategy: MergeStrategy) => {
        try {
            const response = await fetch('/api/import/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    csvData: invoiceCsvData,
                    decisions,
                    globalStrategy
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.details || 'Import failed');
            }

            const result: ImportExecutionResult = await response.json();

            const message = [
                `Import completed!`,
                `Created: ${result.created.invoices} invoices, ${result.created.lineItems} line items`,
                `Updated: ${result.updated.invoices} invoices`,
                `Skipped: ${result.skipped.invoices} invoices`,
                result.errors.length > 0 ? `Errors: ${result.errors.length}` : ''
            ].filter(Boolean).join('\n');

            alert(message);

            setShowImportPreview(false);
            setInvoiceAnalysis(null);
            setInvoiceCsvData([]);
            router.refresh();

        } catch (error) {
            console.error('Import execution error:', error);
            alert(`Import failed: ${(error as Error).message}`);
        }
    };

    const handleClosePreview = () => {
        setShowImportPreview(false);
        setInvoiceAnalysis(null);
        setInvoiceCsvData([]);
    };

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <Sparkles className="w-8 h-8 text-purple-600" />
                        Shadow Detector
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg">
                        Discover hidden subscriptions and import invoice data into your dashboard.
                    </p>
                </div>

                {/* Tabs */}
                <div className="border-b border-slate-200">
                    <nav className="flex gap-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('scan')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                                activeTab === 'scan'
                                    ? 'border-purple-500 text-purple-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                        >
                            <ScanSearch className="w-4 h-4" />
                            Scan Documents
                        </button>
                        <button
                            onClick={() => setActiveTab('import')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                                activeTab === 'import'
                                    ? 'border-purple-500 text-purple-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            Import Data
                        </button>
                    </nav>
                </div>

                {/* Tab Content */}
                {activeTab === 'scan' && (
                    <div className="space-y-6">
                        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                            <p className="text-purple-800 text-sm">
                                <strong>For: Raw vendor invoices (PDF/images)</strong> — Upload invoice documents directly from vendors.
                                Our AI will extract line items, amounts, and vendor details automatically.
                            </p>
                        </div>

                        {/* Upload Area */}
                        {results.length === 0 && (
                            <div
                                className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer group ${isDragging
                                    ? 'border-purple-600 bg-purple-100 scale-[1.02]'
                                    : 'border-slate-300 hover:border-purple-500 hover:bg-purple-50/50'
                                    }`}
                                onClick={() => scanFileInputRef.current?.click()}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                            >
                                <input type="file" ref={scanFileInputRef} onChange={handleScanFileUpload} className="hidden" accept=".csv,.pdf" multiple />

                                {analyzing ? (
                                    <div className="flex flex-col items-center">
                                        <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
                                        <h3 className="text-lg font-medium text-slate-900">Analyzing transactions...</h3>
                                        <p className="text-slate-500">Asking the AI using OpenRouter...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-transform ${isDragging ? 'bg-purple-200 scale-110' : 'bg-purple-100 group-hover:scale-110'
                                            }`}>
                                            <Upload className={`w-8 h-8 ${isDragging ? 'text-purple-700' : 'text-purple-600'}`} />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-2">
                                            {isDragging ? 'Drop file to analyze' : 'Upload Invoice PDF or Image'}
                                        </h3>
                                        <p className="text-slate-500 max-w-sm mx-auto">
                                            Drag and drop or click to select vendor invoice documents. AI will extract and structure the data automatically.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Results */}
                        {results.length > 0 && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-slate-900">Detected Subscriptions ({results.length})</h2>
                                    <button onClick={() => setResults([])} className="text-sm text-slate-500 hover:text-slate-900">Clear & Upload New</button>
                                </div>

                                <div className="grid gap-4">
                                    {results.map((sub, idx) => (
                                        <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between group hover:border-purple-200 transition-colors">
                                            <div className="flex gap-4">
                                                <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
                                                    <img
                                                        src={`https://www.google.com/s2/favicons?domain=${sub.name.replace(/\s+/g, '').toLowerCase()}.com&sz=128`}
                                                        className="w-8 h-8 object-contain"
                                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                                        alt=""
                                                    />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 text-lg">{sub.name}</h3>
                                                    <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                                                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{sub.category}</span>
                                                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            {Math.round(sub.confidence * 100)}% Confidence
                                                        </span>
                                                    </div>
                                                    {sub.reasoning && (
                                                        <p className="text-slate-500 text-xs mt-2 italic bg-slate-50 inline-block px-2 py-1 rounded">
                                                            AI Reasoning: "{sub.reasoning}"
                                                        </p>
                                                    )}

                                                    {/* Line Items Display */}
                                                    {sub.line_items && sub.line_items.length > 0 && (
                                                        <div className="mt-3">
                                                            <details className="group/details" open={true}>
                                                                <summary className="text-xs font-medium text-purple-600 cursor-pointer hover:text-purple-700 flex items-center gap-1 select-none">
                                                                    View {sub.line_items.length} Extracted Line Items
                                                                </summary>
                                                                <div className="mt-2 pl-2 border-l-2 border-slate-100 space-y-2">
                                                                    {sub.line_items.map((item, liIdx) => (
                                                                        <div key={liIdx} className="text-xs text-slate-600 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
                                                                            <span className="font-medium text-slate-800 col-span-3">{item.description}</span>
                                                                            <div className="col-span-3 flex justify-between text-slate-500 border-b border-slate-50 pb-1 mb-1">
                                                                                <span>{item.service_name || "Service"}</span>
                                                                                <div className="flex gap-4">
                                                                                    {item.quantity && <span>Qty: {item.quantity}</span>}
                                                                                    {item.unit_price && <span>Unit: ${item.unit_price}</span>}
                                                                                    <span className="font-bold text-slate-700">${item.cost || item.total_amount}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-3">
                                                <div className="text-xl font-bold text-slate-900">${sub.cost}/mo</div>
                                                <button
                                                    onClick={() => handleAdd(sub, idx)}
                                                    disabled={addingIds.has(idx)}
                                                    className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 text-sm"
                                                >
                                                    {addingIds.has(idx) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                                    Import Record
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'import' && (
                    <div className="space-y-6">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                            <p className="text-blue-800 text-sm">
                                <strong>For: Accounting system exports (CSV)</strong> — Import data from SAP, credit card statements, or other accounting systems.
                                We'll compare against existing records and show you what's new, changed, or pending before importing.
                            </p>
                        </div>

                        {/* Upload Area */}
                        <div
                            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer group ${invoiceIsDragging
                                ? 'border-blue-600 bg-blue-100 scale-[1.02]'
                                : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50/50'
                                }`}
                            onClick={() => invoiceImportRef.current?.click()}
                            onDragOver={onInvoiceDragOver}
                            onDragLeave={onInvoiceDragLeave}
                            onDrop={onInvoiceDrop}
                        >
                            <input type="file" ref={invoiceImportRef} onChange={handleInvoiceFileUpload} className="hidden" accept=".csv" />

                            {analyzingInvoices ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                                    <h3 className="text-lg font-medium text-slate-900">Analyzing data...</h3>
                                    <p className="text-slate-500">Comparing against existing records...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-transform ${invoiceIsDragging ? 'bg-blue-200 scale-110' : 'bg-blue-100 group-hover:scale-110'
                                        }`}>
                                        <FileSpreadsheet className={`w-8 h-8 ${invoiceIsDragging ? 'text-blue-700' : 'text-blue-600'}`} />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 mb-2">
                                        {invoiceIsDragging ? 'Drop CSV to analyze' : 'Upload CSV Export'}
                                    </h3>
                                    <p className="text-slate-500 max-w-sm mx-auto">
                                        Drag and drop your SAP invoice export, credit card statement, or other accounting CSV.
                                    </p>
                                    <p className="text-slate-400 text-xs mt-4">
                                        Supports: SAP invoice exports, credit card transaction CSVs, and similar formats
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Conflict Modal (for Device Scan) */}
            {conflictSub && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-lg">Subscription Exists</h3>
                                <p className="text-slate-500 mt-1 text-sm">
                                    <span className="font-semibold text-slate-800">{conflictSub.existing.name}</span> is already in your dashboard.
                                </p>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-lg mb-6 text-sm">
                            <div className="flex justify-between mb-2">
                                <span className="text-slate-500">Current Cost:</span>
                                <span className="font-medium text-slate-900">${conflictSub.existing.cost}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">New Detected Cost:</span>
                                <span className="font-bold text-emerald-600">${conflictSub.new.cost}</span>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConflictSub(null)}
                                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                className="px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800"
                            >
                                Update Cost
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Preview Modal */}
            <ImportPreviewModal
                isOpen={showImportPreview}
                onClose={handleClosePreview}
                analysis={invoiceAnalysis}
                csvData={invoiceCsvData}
                onExecute={handleExecuteImport}
            />
        </DashboardLayout>
    );
}
