import { Vendor } from "@/types";
import { VendorLogo } from "../common/VendorLogo";
import { Globe, Mail, RefreshCw } from "lucide-react";

interface VendorDetailsSectionProps {
    vendor: Vendor;
    onChange: (field: keyof Vendor, value: string) => void;
}

export function VendorDetailsSection({ vendor, onChange }: VendorDetailsSectionProps) {

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

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
            <div className="lg:col-span-1">
                <h3 className="text-lg font-medium text-slate-900">Vendor Information</h3>
                <p className="mt-1 text-sm text-slate-500">Details about the service provider and contact info.</p>
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
