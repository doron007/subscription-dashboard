import React, { useState, useEffect } from 'react';
import { ChevronDown, ArrowDown, AlertTriangle, Check, X, Search } from 'lucide-react';

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    subscriptionCount?: number;
    invoiceCount?: number;
}

interface MergePreview {
    subscriptions: number;
    invoices: number;
    services: number;
    lineItems: number;
}

interface VendorMergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceVendor: { id: string; name: string } | null;
    onMergeComplete: () => void;
}

export function VendorMergeModal({
    isOpen,
    onClose,
    sourceVendor,
    onMergeComplete
}: VendorMergeModalProps) {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(false);
    const [merging, setMerging] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTarget, setSelectedTarget] = useState<Vendor | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [renameEnabled, setRenameEnabled] = useState(false);
    const [newName, setNewName] = useState('');
    const [preview, setPreview] = useState<MergePreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch vendors on open
    useEffect(() => {
        if (isOpen) {
            fetchVendors();
            setSelectedTarget(null);
            setRenameEnabled(false);
            setNewName('');
            setSearchTerm('');
            setError(null);
        }
    }, [isOpen]);

    // Fetch merge preview when source vendor changes
    useEffect(() => {
        if (isOpen && sourceVendor) {
            fetchPreview();
        }
    }, [isOpen, sourceVendor]);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/vendors');
            if (res.ok) {
                const data = await res.json();
                setVendors(data);
            }
        } catch (err) {
            console.error('Failed to fetch vendors:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPreview = async () => {
        if (!sourceVendor) return;
        setPreviewLoading(true);
        try {
            const res = await fetch(`/api/vendors/merge?sourceVendorId=${sourceVendor.id}`);
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
        if (!sourceVendor || !selectedTarget) return;

        setMerging(true);
        setError(null);

        try {
            const res = await fetch('/api/vendors/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceVendorId: sourceVendor.id,
                    targetVendorId: selectedTarget.id,
                    newName: renameEnabled && newName.trim() ? newName.trim() : undefined
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

    if (!isOpen || !sourceVendor) return null;

    // Filter vendors for dropdown (exclude source)
    const filteredVendors = vendors.filter(v =>
        v.id !== sourceVendor.id &&
        v.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white">Merge Vendors</h3>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-5 space-y-5">
                    {/* Source Vendor */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Source (will be removed)
                        </label>
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-white font-bold">
                                    {sourceVendor.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-white font-medium">{sourceVendor.name}</div>
                                    {previewLoading ? (
                                        <div className="text-gray-500 text-xs">Loading...</div>
                                    ) : preview ? (
                                        <div className="text-gray-500 text-xs">
                                            {preview.subscriptions} subscription{preview.subscriptions !== 1 ? 's' : ''}, {preview.invoices} invoice{preview.invoices !== 1 ? 's' : ''}
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

                    {/* Target Vendor Selector */}
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
                                    <span className="text-gray-500">Select target vendor...</span>
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
                                                placeholder="Search vendors..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-md text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {/* Options */}
                                    <div className="max-h-48 overflow-y-auto">
                                        {loading ? (
                                            <div className="px-4 py-3 text-gray-500 text-sm">Loading vendors...</div>
                                        ) : filteredVendors.length === 0 ? (
                                            <div className="px-4 py-3 text-gray-500 text-sm">No vendors found</div>
                                        ) : (
                                            filteredVendors.map(vendor => (
                                                <button
                                                    key={vendor.id}
                                                    onClick={() => {
                                                        setSelectedTarget(vendor);
                                                        setDropdownOpen(false);
                                                        setSearchTerm('');
                                                    }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                                                >
                                                    <div className="w-8 h-8 bg-white/10 rounded-md flex items-center justify-center text-white text-sm font-medium">
                                                        {vendor.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-white text-sm">{vendor.name}</div>
                                                        <div className="text-gray-500 text-xs">
                                                            {vendor.subscriptionCount || 0} subscriptions, {vendor.invoiceCount || 0} invoices
                                                        </div>
                                                    </div>
                                                    {selectedTarget?.id === vendor.id && (
                                                        <Check className="w-4 h-4 text-cyan-400 ml-auto" />
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Rename Option */}
                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={renameEnabled}
                                onChange={(e) => {
                                    setRenameEnabled(e.target.checked);
                                    if (!e.target.checked) setNewName('');
                                }}
                                className="bg-black/40 border-white/20 rounded text-cyan-500 focus:ring-cyan-500"
                            />
                            <span className="text-sm text-gray-400">Rename merged vendor to:</span>
                        </label>
                        {renameEnabled && (
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Enter new vendor name..."
                                className="mt-2 w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                            />
                        )}
                    </div>

                    {/* Impact Warning */}
                    {preview && (preview.subscriptions > 0 || preview.invoices > 0 || preview.services > 0 || preview.lineItems > 0) && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-amber-400 font-medium text-sm">This will move:</p>
                                    <ul className="mt-2 text-amber-400/80 text-xs space-y-1 list-disc list-inside">
                                        {preview.subscriptions > 0 && (
                                            <li>{preview.subscriptions} subscription{preview.subscriptions !== 1 ? 's' : ''}</li>
                                        )}
                                        {preview.invoices > 0 && (
                                            <li>{preview.invoices} invoice{preview.invoices !== 1 ? 's' : ''}</li>
                                        )}
                                        {preview.lineItems > 0 && (
                                            <li>{preview.lineItems} line item{preview.lineItems !== 1 ? 's' : ''}</li>
                                        )}
                                        {preview.services > 0 && (
                                            <li>{preview.services} service{preview.services !== 1 ? 's' : ''}</li>
                                        )}
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
                            'Merge Vendors'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
