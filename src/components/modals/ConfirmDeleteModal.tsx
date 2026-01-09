import React, { useState } from 'react';

interface ConfirmDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    entityName: string;
    entityType: 'Vendor' | 'Service' | 'Line Item' | 'Subscription';
    cascadeImpact?: {
        subscriptions?: number;
        services?: number;
        invoices?: number;
        lineItems?: number;
    };
    isDeleting: boolean;
}

export function ConfirmDeleteModal({
    isOpen,
    onClose,
    onConfirm,
    entityName,
    entityType,
    cascadeImpact,
    isDeleting
}: ConfirmDeleteModalProps) {
    const [confirmed, setConfirmed] = useState(false);

    if (!isOpen) return null;

    const hasCascade = cascadeImpact && (
        (cascadeImpact.subscriptions || 0) > 0 ||
        (cascadeImpact.services || 0) > 0 ||
        (cascadeImpact.invoices || 0) > 0 ||
        (cascadeImpact.lineItems || 0) > 0
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-2">Delete {entityType}</h3>

                <div className="mb-6 space-y-4">
                    <p className="text-gray-400">
                        Are you sure you want to delete <span className="text-white font-medium">{entityName}</span>?
                        This action cannot be undone.
                    </p>

                    {/* Discrepancy Warning */}
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                        <div className="flex gap-3">
                            <span className="text-xl">⚠️</span>
                            <div>
                                <p className="text-yellow-400 font-medium text-sm">Discrepancy Warning</p>
                                <p className="text-yellow-500/80 text-xs mt-1">
                                    Deleting this item will cause the calculated totals to differ from the original invoice data.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Cascade Warning */}
                    {hasCascade && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <p className="text-red-400 font-medium text-sm mb-2">This will also delete:</p>
                            <ul className="list-disc list-inside text-red-400/80 text-xs space-y-1">
                                {cascadeImpact.subscriptions ? (<li>{cascadeImpact.subscriptions} subscription(s)</li>) : null}
                                {cascadeImpact.services ? (<li>{cascadeImpact.services} service(s)</li>) : null}
                                {cascadeImpact.invoices ? (<li>{cascadeImpact.invoices} invoice(s)</li>) : null}
                                {cascadeImpact.lineItems ? (<li>{cascadeImpact.lineItems} line item(s)</li>) : null}
                            </ul>
                        </div>
                    )}
                </div>

                {hasCascade && (
                    <div className="mb-6 flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="confirm-cascade"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className="bg-black/40 border-white/20 rounded text-cyan-500 focus:ring-cyan-500"
                        />
                        <label htmlFor="confirm-cascade" className="text-sm text-gray-400 select-none cursor-pointer">
                            I understand that this data will be permanently lost
                        </label>
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isDeleting || (hasCascade && !confirmed)}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                        {isDeleting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            'Confirm Delete'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
