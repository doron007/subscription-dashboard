'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Papa from 'papaparse';
import { aiService, type AnalyzedSubscription } from '@/services/aiService';
import { subscriptionService } from '@/services/subscriptionService';
import { convertPdfToImages } from '@/lib/pdfUtils';
import type { Subscription } from '@/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Upload, Sparkles, AlertTriangle, CheckCircle, Loader2, Plus, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Main wrapper component with Suspense for useSearchParams
export default function ShadowItPage() {
    return (
        <Suspense fallback={<DashboardLayout><div className="max-w-4xl mx-auto p-8 text-center text-slate-500">Loading...</div></DashboardLayout>}>
            <ShadowItContent />
        </Suspense>
    );
}

function ShadowItContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [analyzing, setAnalyzing] = useState(false);
    const [results, setResults] = useState<AnalyzedSubscription[]>([]);
    const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
    const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);

    // Duplicate Detection State
    const [existingSubscriptions, setExistingSubscriptions] = useState<Subscription[]>([]);
    const [conflictSub, setConflictSub] = useState<{ existing: Subscription, new: AnalyzedSubscription, index: number } | null>(null);

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

            // Fetch the test PDF from public folder
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

    const [isDragging, setIsDragging] = useState(false);

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
                        // Continue to next file
                    }
                } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                    hasCsv = true;
                    // For CSV, we need to wrap Papa.parse in a promise
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

            // Analyze collected data
            if (hasPdf && allImages.length > 0) {
                console.log(`Sending ${allImages.length} images to AI...`);
                // If we also have CSV data, we might want to send it too, but AI service currently splits paths.
                // For now, prioritize Vision if images exist.
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) processFiles(Array.from(files));
    };

    const handleAdd = async (sub: AnalyzedSubscription, index: number) => {
        // 1. Check for duplicate
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
            // Check if this is a rich invoice analysis (has line items with quantities, etc.)
            // We can infer this if line_items are present and have granular data.
            // Or we check if it came from the Image pipeline which now returns the rich object structure.
            const isRichInvoice = sub.line_items && sub.line_items.length > 0 && sub.line_items.some(li => li.quantity !== undefined);

            if (isRichInvoice) {
                // Reconstruct AnalyzedInvoice for the API
                // Use actual invoice number if available, otherwise generate a fallback
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
                alert('Invoice processed and linked to dashboard!'); // Temporary feedback
            } else {
                // Legacy CSV / Simple Path
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

            // Remove from results list to show progress
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
                // Update other fields if needed, e.g. status
                status: 'Active'
            });

            // Add detected transactions from Update
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

            // Refresh local list
            const updatedList = existingSubscriptions.map(s => s.id === existing.id ? { ...s, cost: newSub.cost } : s);
            setExistingSubscriptions(updatedList);

            // Remove from results
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

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Beta Feature</span>
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <Sparkles className="w-8 h-8 text-purple-600" />
                        Shadow IT Detector
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg">
                        Upload your credit card statement. Our AI will hunt for hidden subscriptions you didn't know about.
                    </p>
                </div>

                {/* Upload Area */}
                {results.length === 0 && (
                    <div
                        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer group ${isDragging
                            ? 'border-purple-600 bg-purple-100 scale-[1.02]'
                            : 'border-slate-300 hover:border-purple-500 hover:bg-purple-50/50'
                            }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                    >
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.pdf" multiple />

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
                                    {isDragging ? 'Drop file to analyze' : 'Upload Bank Statement (CSV or PDF)'}
                                </h3>
                                <p className="text-slate-500 max-w-sm mx-auto">
                                    Drag and drop or click to select files. We'll analyze transaction descriptions to find recurring software costs.
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
            {/* Conflict Modal */}
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
        </DashboardLayout>
    );
}
