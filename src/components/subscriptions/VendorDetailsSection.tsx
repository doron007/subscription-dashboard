'use client';

import { useState } from 'react';
import { Vendor } from "@/types";
import { VendorLogo } from "../common/VendorLogo";
import { Globe, Mail, RefreshCw, Sparkles, Loader2, Tag, Check, X } from "lucide-react";

interface VendorDetailsSectionProps {
    vendor: Vendor;
    onChange: (field: keyof Vendor, value: string) => void;
}

interface AISuggestions {
    website?: string;
    category?: string;
    billingCycle?: string;
}

export function VendorDetailsSection({ vendor, onChange }: VendorDetailsSectionProps) {
    const [enriching, setEnriching] = useState(false);
    const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
    const [enrichError, setEnrichError] = useState<string | null>(null);

    const handleGenerateLogo = () => {
        if (!vendor.website) return;
        const domain = vendor.website.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
        const newLogoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        onChange('logoUrl', newLogoUrl);
    };

    const handleSmartLogoUpdate = () => {
        if (!vendor.website) return;

        const isFavicon = vendor.logoUrl?.includes('google.com/s2/favicons');
        const isEmpty = !vendor.logoUrl;

        // Only update if it's empty or already using a favicon
        if (isEmpty || isFavicon) {
            handleGenerateLogo();
        }
    };

    const handleEnrichWithAI = async () => {
        if (!vendor.name) return;

        setEnriching(true);
        setEnrichError(null);
        setSuggestions(null);

        try {
            const response = await fetch('/api/vendors/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorName: vendor.name })
            });

            if (!response.ok) {
                throw new Error('Failed to enrich vendor data');
            }

            const data = await response.json();
            setSuggestions(data);
        } catch (error) {
            console.error('Failed to enrich vendor:', error);
            setEnrichError('Could not get AI suggestions. Please try again later.');
        } finally {
            setEnriching(false);
        }
    };

    const applySuggestion = (field: keyof AISuggestions) => {
        if (!suggestions || !suggestions[field]) return;

        if (field === 'website') {
            onChange('website', suggestions.website!);
            // Also update logo
            const domain = suggestions.website!.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
            const newLogoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            onChange('logoUrl', newLogoUrl);
        } else if (field === 'category') {
            onChange('category', suggestions.category!);
        }

        // Remove applied suggestion
        setSuggestions(prev => prev ? { ...prev, [field]: undefined } : null);
    };

    const dismissSuggestion = (field: keyof AISuggestions) => {
        setSuggestions(prev => prev ? { ...prev, [field]: undefined } : null);
    };

    const hasSuggestions = suggestions && (suggestions.website || suggestions.category);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
            <div className="lg:col-span-1">
                <h3 className="text-lg font-medium text-slate-900">Vendor Information</h3>
                <p className="mt-1 text-sm text-slate-500">Details about the service provider and contact info.</p>

                {/* Enhance with AI Button */}
                <button
                    type="button"
                    onClick={handleEnrichWithAI}
                    disabled={enriching || !vendor.name}
                    className="mt-4 w-full px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                    {enriching ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4" />
                            Enhance with AI
                        </>
                    )}
                </button>
                {enrichError && (
                    <p className="mt-2 text-xs text-red-600">{enrichError}</p>
                )}
            </div>
            <div className="lg:col-span-2">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Header Row with Logo and Name */}
                    <div className="col-span-1 md:col-span-2 flex items-start gap-4">
                        <div className="flex-shrink-0">
                            <div className="relative group">
                                <VendorLogo name={vendor.name} logo={vendor.logoUrl} className="w-16 h-16 text-xl p-2" />
                            </div>
                        </div>
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name</label>
                                <input
                                    type="text"
                                    value={vendor.name}
                                    onChange={(e) => onChange('name', e.target.value)}
                                    className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Category */}
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Category <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={vendor.category || ''}
                                onChange={(e) => onChange('category', e.target.value)}
                                placeholder="e.g. CRM, Security, Productivity"
                                className="w-full pl-9 rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        {suggestions?.category && (
                            <div className="mt-2 flex items-center gap-2 p-2 bg-violet-50 border border-violet-200 rounded-lg">
                                <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0" />
                                <span className="text-sm text-violet-900 flex-1">
                                    AI suggests: <strong>{suggestions.category}</strong>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => applySuggestion('category')}
                                    className="p-1 hover:bg-violet-100 rounded text-violet-600"
                                    title="Apply suggestion"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => dismissSuggestion('category')}
                                    className="p-1 hover:bg-violet-100 rounded text-slate-400"
                                    title="Dismiss"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Contact Email */}
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="email"
                                value={vendor.contactEmail || ''}
                                onChange={(e) => onChange('contactEmail', e.target.value)}
                                placeholder="support@vendor.com"
                                className="w-full pl-9 rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Website */}
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Company URL</label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={vendor.website || ''}
                                onChange={(e) => onChange('website', e.target.value)}
                                onBlur={handleSmartLogoUpdate}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSmartLogoUpdate();
                                    }
                                }}
                                placeholder="example.com"
                                className="w-full pl-9 rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        {suggestions?.website && (
                            <div className="mt-2 flex items-center gap-2 p-2 bg-violet-50 border border-violet-200 rounded-lg">
                                <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0" />
                                <span className="text-sm text-violet-900 flex-1">
                                    AI suggests: <strong>{suggestions.website}</strong>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => applySuggestion('website')}
                                    className="p-1 hover:bg-violet-100 rounded text-violet-600"
                                    title="Apply suggestion"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => dismissSuggestion('website')}
                                    className="p-1 hover:bg-violet-100 rounded text-slate-400"
                                    title="Dismiss"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Logo URL */}
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL</label>
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={vendor.logoUrl || ''}
                                onChange={(e) => onChange('logoUrl', e.target.value)}
                                placeholder="https://..."
                                className="w-full rounded-lg border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <div className="flex justify-between items-center">
                                <p className="text-xs text-slate-500">
                                    Enter a direct image URL or use the favicon generator.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleGenerateLogo}
                                    disabled={!vendor.website}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Force update logo from website favicon"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Reset to Favicon
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
