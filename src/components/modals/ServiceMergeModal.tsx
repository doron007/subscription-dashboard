import React, { useState, useEffect } from 'react';
import { ChevronDown, ArrowDown, AlertTriangle, Check, X, Search } from 'lucide-react';

interface Service {
    id: string;
    name: string;
    currentQuantity?: number;
    currentUnitPrice?: number;
    currency?: string;
}

interface MergePreview {
    lineItems: number;
    totalAmount: number;
}

interface ServiceMergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceService: { id: string; name: string; subscriptionId: string } | null;
    availableServices: Service[];
    onMergeComplete: () => void;
}

export function ServiceMergeModal({
    isOpen,
    onClose,
    sourceService,
    availableServices,
    onMergeComplete
}: ServiceMergeModalProps) {
    const [merging, setMerging] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTarget, setSelectedTarget] = useState<Service | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [preview, setPreview] = useState<MergePreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setSelectedTarget(null);
            setSearchTerm('');
            setError(null);
        }
    }, [isOpen]);

    // Fetch merge preview when source service changes
    useEffect(() => {
        if (isOpen && sourceService) {
            fetchPreview();
        }
    }, [isOpen, sourceService]);

    const fetchPreview = async () => {
        if (!sourceService) return;
        setPreviewLoading(true);
        try {
            const res = await fetch(`/api/services/merge?sourceServiceId=${sourceService.id}`);
            if (res.ok) {
                const data = await res.json();
                setPreview(data);
            }
        } catch (err) {
            console.error('Failed to fetch preview:', err);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleMerge = async () => {
        if (!sourceService || !selectedTarget) return;

        setMerging(true);
        setError(null);

        try {
            const res = await fetch('/api/services/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceServiceId: sourceService.id,
                    targetServiceId: selectedTarget.id
                })
            });

            if (res.ok) {
                onMergeComplete();
                onClose();
            } else {
                const data = await res.json();
                setError(data.error || 'Merge failed');
            }
        } catch (err) {
            setError('Network error occurred');
        } finally {
            setMerging(false);
        }
    };

    if (!isOpen || !sourceService) return null;

    // Filter services for dropdown (exclude source, same subscription only)
    const filteredServices = availableServices.filter(s =>
        s.id !== sourceService.id &&
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatCurrency = (amount: number | undefined, currency: string = 'USD') => {
        if (amount === undefined) return '-';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency
        }).format(amount);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white">Merge Services</h3>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-5 space-y-5">
                    {/* Source Service */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Source (will be removed)
                        </label>
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-white font-bold">
                                    {sourceService.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-white font-medium">{sourceService.name}</div>
                                    {previewLoading ? (
                                        <div className="text-gray-500 text-xs">Loading...</div>
                                    ) : preview ? (
                                        <div className="text-gray-500 text-xs">
                                            {preview.lineItems} line item{preview.lineItems !== 1 ? 's' : ''} ({formatCurrency(preview.totalAmount)})
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                        <ArrowDown className="w-5 h-5 text-gray-500" />
                    </div>

                    {/* Target Service Selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Merge into
                        </label>
                        <div className="relative">
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-left hover:border-white/20 transition-colors"
                            >
                                {selectedTarget ? (
                                    <span className="text-white">{selectedTarget.name}</span>
                                ) : (
                                    <span className="text-gray-500">Select target service...</span>
                                )}
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {dropdownOpen && (
                                <div className="absolute z-10 mt-2 w-full bg-[#1A1A1A] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                                    {/* Search */}
                                    <div className="p-2 border-b border-white/10">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                            <input
                                                type="text"
                                                placeholder="Search services..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-md text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {/* Options */}
                                    <div className="max-h-48 overflow-y-auto">
                                        {filteredServices.length === 0 ? (
                                            <div className="px-4 py-3 text-gray-500 text-sm">No other services found</div>
                                        ) : (
                                            filteredServices.map(service => (
                                                <button
                                                    key={service.id}
                                                    onClick={() => {
                                                        setSelectedTarget(service);
                                                        setDropdownOpen(false);
                                                        setSearchTerm('');
                                                    }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                                                >
                                                    <div className="w-8 h-8 bg-white/10 rounded-md flex items-center justify-center text-white text-sm font-medium">
                                                        {service.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-white text-sm truncate">{service.name}</div>
                                                        {service.currentQuantity && service.currentUnitPrice && (
                                                            <div className="text-gray-500 text-xs">
                                                                {service.currentQuantity} x {formatCurrency(service.currentUnitPrice, service.currency)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {selectedTarget?.id === service.id && (
                                                        <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Impact Warning */}
                    {preview && preview.lineItems > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-amber-400 font-medium text-sm">This will move:</p>
                                    <ul className="mt-2 text-amber-400/80 text-xs space-y-1 list-disc list-inside">
                                        <li>{preview.lineItems} line item{preview.lineItems !== 1 ? 's' : ''}</li>
                                        <li>Total: {formatCurrency(preview.totalAmount)}</li>
                                    </ul>
                                    <p className="mt-2 text-amber-500/60 text-xs">This action cannot be undone.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
                    <button
                        onClick={onClose}
                        disabled={merging}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleMerge}
                        disabled={merging || !selectedTarget}
                        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                        {merging ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                Merging...
                            </>
                        ) : (
                            'Merge Services'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
