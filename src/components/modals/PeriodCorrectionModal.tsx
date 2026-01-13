'use client';

import React, { useState, useMemo } from 'react';
import { X, Calendar, AlertTriangle, ArrowRight, Check } from 'lucide-react';
import { format, parseISO, startOfMonth, addMonths, subMonths } from 'date-fns';

export type CorrectionLevel = 'invoice' | 'service' | 'lineItem';

export interface CorrectionTarget {
    level: CorrectionLevel;
    // Common fields
    sourceMonth: string; // yyyy-MM-dd
    totalAmount: number;
    itemCount: number;
    // Level-specific identifiers
    invoiceId?: string;
    invoiceNumber?: string;
    serviceName?: string;
    lineItemId?: string;
    lineItemDescription?: string;
    vendorName?: string;
    // Flag indicating items already have manual overrides
    isManualOverride?: boolean;
}

interface PeriodCorrectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (targetMonth: string) => Promise<void>;
    target: CorrectionTarget | null;
}

export function PeriodCorrectionModal({
    isOpen,
    onClose,
    onConfirm,
    target
}: PeriodCorrectionModalProps) {
    const [targetMonth, setTargetMonth] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Generate list of months for selection (12 months back and 3 forward)
    const monthOptions = useMemo(() => {
        const options: { value: string; label: string }[] = [];
        const now = new Date();

        for (let i = -12; i <= 3; i++) {
            const month = addMonths(startOfMonth(now), i);
            options.push({
                value: format(month, 'yyyy-MM-dd'),
                label: format(month, 'MMMM yyyy')
            });
        }
        return options;
    }, []);

    // Set default target month when modal opens
    React.useEffect(() => {
        if (isOpen && target?.sourceMonth) {
            // Default to one month before source as a common correction
            const sourceDate = parseISO(target.sourceMonth);
            setTargetMonth(format(subMonths(sourceDate, 1), 'yyyy-MM-dd'));
        }
    }, [isOpen, target?.sourceMonth]);

    if (!isOpen || !target) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetMonth) {
            setError('Please select a target month');
            return;
        }
        if (targetMonth === target.sourceMonth) {
            setError('Target month must be different from source month');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await onConfirm(targetMonth);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to move period');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getLevelLabel = () => {
        switch (target.level) {
            case 'invoice': return 'Entire Invoice';
            case 'service': return 'Service';
            case 'lineItem': return 'Line Item';
        }
    };

    const getTargetDescription = () => {
        switch (target.level) {
            case 'invoice':
                return `Invoice #${target.invoiceNumber || 'Unknown'}`;
            case 'service':
                return target.serviceName || 'Unknown Service';
            case 'lineItem':
                return target.lineItemDescription?.slice(0, 50) + (target.lineItemDescription && target.lineItemDescription.length > 50 ? '...' : '') || 'Unknown Item';
        }
    };

    const sourceMonthLabel = target.sourceMonth
        ? format(parseISO(target.sourceMonth), 'MMMM yyyy')
        : 'Unknown';

    const targetMonthLabel = targetMonth
        ? format(parseISO(targetMonth), 'MMMM yyyy')
        : 'Select month...';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-lg font-semibold text-slate-900">
                            Move to Different Period
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* What's being moved */}
                    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                                {getLevelLabel()}
                            </span>
                            {target.isManualOverride && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                    Previously adjusted
                                </span>
                            )}
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                            {getTargetDescription()}
                        </p>
                        {target.vendorName && (
                            <p className="text-xs text-slate-500">{target.vendorName}</p>
                        )}
                        <div className="flex items-center gap-4 pt-1">
                            <span className="text-sm text-slate-600">
                                <span className="font-semibold text-slate-900">
                                    ${target.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </span>
                            <span className="text-sm text-slate-500">
                                {target.itemCount} item{target.itemCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>

                    {/* Period change visualization */}
                    <div className="flex items-center justify-center gap-3 py-2">
                        <div className="text-center">
                            <p className="text-xs text-slate-500 mb-1">From</p>
                            <p className="text-sm font-medium text-slate-900 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg border border-red-200">
                                {sourceMonthLabel}
                            </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-400 mt-4" />
                        <div className="text-center">
                            <p className="text-xs text-slate-500 mb-1">To</p>
                            <p className="text-sm font-medium text-slate-900 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg border border-green-200">
                                {targetMonthLabel}
                            </p>
                        </div>
                    </div>

                    {/* Target month selector */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Select Target Month
                        </label>
                        <select
                            value={targetMonth}
                            onChange={(e) => {
                                setTargetMonth(e.target.value);
                                setError(null);
                            }}
                            className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                        >
                            <option value="">Select a month...</option>
                            {monthOptions.map(opt => (
                                <option
                                    key={opt.value}
                                    value={opt.value}
                                    disabled={opt.value === target.sourceMonth}
                                >
                                    {opt.label} {opt.value === target.sourceMonth ? '(current)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Warning */}
                    <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                            This will override the automatic period detection. The change will be reflected in all reports immediately.
                        </p>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !targetMonth}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Moving...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    Confirm Move
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
