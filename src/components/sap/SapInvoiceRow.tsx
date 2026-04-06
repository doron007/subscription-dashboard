'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Save, AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';
import type { ETLInvoice, SupabaseInvoice, InvoiceOverrides, ETLOverride, ReviewReason } from '@/lib/etl/types';
import { formatReviewReason } from '@/lib/etl/classify-match';
import type { MatchedItem } from '@/lib/etl/types';

interface SapInvoiceRowProps {
  etlInvoice: ETLInvoice;
  supabaseInvoice?: SupabaseInvoice | null;
  supabaseGroup?: SupabaseInvoice[];  // for MONTHLY_TOTAL: all invoices in the group
  matchType?: 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'MONTHLY_TOTAL' | 'NONE';
  amountDiff?: number;
  isNew?: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  overrides?: InvoiceOverrides;
  onOverride?: (groupKey: string, overrides: InvoiceOverrides, etl?: ETLInvoice) => void;
  persistedOverride?: ETLOverride;
  readOnly?: boolean;
  reviewReasons?: ReviewReason[];
  suggestion?: string;
  onConfirm?: (groupKey: string, etl: ETLInvoice) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function MatchBadge({ matchType }: { matchType: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    EXACT: { bg: 'bg-green-100', text: 'text-green-800', label: 'Exact' },
    CLOSE: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Close' },
    MONTH_MATCH: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Month' },
    MONTHLY_TOTAL: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Monthly Total' },
    NONE: { bg: 'bg-red-100', text: 'text-red-800', label: 'No Match' },
    NEW: { bg: 'bg-teal-100', text: 'text-teal-800', label: 'New' },
  };

  const { bg, text, label } = config[matchType] || config.NONE;

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
}

export function SapInvoiceRow({
  etlInvoice,
  supabaseInvoice,
  supabaseGroup,
  matchType,
  amountDiff,
  isNew = false,
  isSelected,
  onToggleSelect,
  overrides,
  onOverride,
  persistedOverride,
  readOnly = false,
  reviewReasons,
  suggestion,
  onConfirm,
}: SapInvoiceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSapDetail, setShowSapDetail] = useState(true);
  const [showSubDetail, setShowSubDetail] = useState(false);

  const badgeType = isNew ? 'NEW' : (matchType || 'NONE');
  const hasLargeDiff = amountDiff !== undefined && Math.abs(amountDiff) > 50;
  const hasSubLineItems = supabaseInvoice && supabaseInvoice.lineItems && supabaseInvoice.lineItems.length > 0;
  const currentAction = overrides?.importAction || (isNew ? 'CREATE' : 'UPDATE');
  const isSkipped = currentAction === 'SKIP';

  // Generate billing month options (12 months around the ETL billing month)
  const billingMonthOptions: string[] = [];
  const baseDate = new Date(etlInvoice.billingMonth || '2026-01-01');
  for (let i = -3; i <= 8; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
    billingMonthOptions.push(d.toISOString().substring(0, 10));
  }

  const effectiveBillingMonth = overrides?.billingMonth || etlInvoice.billingMonth;

  const hasPersisted = !!persistedOverride && !persistedOverride.importedAt;
  const hasConflict = !!persistedOverride?.conflict;

  function handleOverride(partial: Partial<InvoiceOverrides>) {
    if (!onOverride) return;
    onOverride(etlInvoice.groupKey, { ...overrides, ...partial }, etlInvoice);
  }

  async function clearOverride() {
    if (!persistedOverride) return;
    await fetch(`/api/sap/overrides/${persistedOverride.id}`, { method: 'DELETE' });
    if (onOverride) {
      onOverride(etlInvoice.groupKey, {}, etlInvoice);
    }
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${isSkipped ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
      {/* Main row */}
      <div
        className={`flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors ${
          hasLargeDiff && !isNew ? 'bg-red-50/30' : 'bg-white'
        }`}
      >
        {readOnly ? (
          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
        ) : (
          <input
            type="checkbox"
            checked={isSelected && !isSkipped}
            disabled={isSkipped}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
          />
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-slate-600 flex-shrink-0"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 truncate">
              {etlInvoice.supabaseVendor || etlInvoice.sapVendor}
            </span>
            <MatchBadge matchType={badgeType} />
            {reviewReasons && reviewReasons.length > 0 && reviewReasons.map((reason) => (
              <span
                key={reason}
                className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200"
                title={formatReviewReason(reason, { etl: etlInvoice, supabase: supabaseInvoice!, supabaseGroup, matchType: matchType as MatchedItem['matchType'], amountDiff: amountDiff ?? 0 })}
              >
                {formatReviewReason(reason, { etl: etlInvoice, supabase: supabaseInvoice!, supabaseGroup, matchType: matchType as MatchedItem['matchType'], amountDiff: amountDiff ?? 0 })}
              </span>
            ))}
            {hasPersisted && !hasConflict && (
              <span title="Decision saved" className="text-blue-500"><Save className="w-3.5 h-3.5" /></span>
            )}
            {hasConflict && (
              <span title="SAP data changed since your last decision" className="text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /></span>
            )}
            {hasPersisted && (
              <button onClick={clearOverride} title="Clear saved decision" className="text-slate-400 hover:text-red-500">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            {isSkipped && <span className="text-xs text-slate-400 italic">Skipped</span>}
            {onConfirm && !readOnly && !isSkipped && (
              <button
                onClick={(e) => { e.stopPropagation(); onConfirm(etlInvoice.groupKey, etlInvoice); }}
                title="Confirm — DB is correct, no action needed"
                className="px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                Confirm
              </button>
            )}
          </div>
          {suggestion && (
            <div className="text-xs text-blue-600 mt-0.5 italic">
              {suggestion}
            </div>
          )}
          <div className="text-xs text-slate-500 mt-0.5">
            {effectiveBillingMonth} &bull; {etlInvoice.lineItems.length} line items
          </div>
        </div>

        {/* SAP amount + date */}
        <div className="text-right flex-shrink-0">
          <div className="font-semibold text-slate-800">
            {formatCurrency(etlInvoice.computedAmount)}
          </div>
          <div className="text-xs text-slate-500">{etlInvoice.postingDate}</div>
        </div>

        {/* Supabase amount + diff (only for matched) */}
        {supabaseInvoice && !isNew && (
          <div className="text-right flex-shrink-0 ml-4 pl-4 border-l border-slate-200">
            <div className="text-sm text-slate-600">
              {formatCurrency(supabaseInvoice.total_amount)}
            </div>
            <div
              className={`text-xs font-medium ${
                amountDiff === 0 ? 'text-green-600' : hasLargeDiff ? 'text-red-600' : 'text-yellow-600'
              }`}
            >
              {amountDiff !== undefined && amountDiff !== 0 && (
                <>{amountDiff > 0 ? '+' : ''}{formatCurrency(amountDiff)}</>
              )}
              {amountDiff === 0 && 'Match'}
            </div>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200">
          {/* Override controls (for both matched and new records) */}
          {onOverride && !readOnly && (
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <label className="text-slate-600 font-medium">Import As:</label>
                <select
                  value={currentAction}
                  onChange={(e) => handleOverride({ importAction: e.target.value as InvoiceOverrides['importAction'] })}
                  className="border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                >
                  {!isNew && <option value="UPDATE">Update Existing</option>}
                  <option value="CREATE">Create New</option>
                  <option value="SKIP">Skip</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-slate-600 font-medium">Billing Period:</label>
                <select
                  value={effectiveBillingMonth}
                  onChange={(e) => handleOverride({ billingMonth: e.target.value })}
                  className="border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                >
                  {billingMonthOptions.map((m) => (
                    <option key={m} value={m}>
                      {m.substring(0, 7)}
                    </option>
                  ))}
                </select>
              </div>
              {matchType === 'MONTHLY_TOTAL' && supabaseGroup && (
                <div className="text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded">
                  This SAP charge covers {supabaseGroup.length} existing DB invoices totaling {formatCurrency(supabaseGroup.reduce((s, i) => s + i.total_amount, 0))}
                </div>
              )}
            </div>
          )}

          {/* SAP Line Items (collapsible) */}
          <div className="bg-slate-50/50">
            <button
              onClick={() => setShowSapDetail(!showSapDetail)}
              className="w-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-teal-700 hover:bg-teal-50/50 transition-colors"
            >
              {showSapDetail ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              From SAP ({etlInvoice.lineItems.length} GL entries)
            </button>
            {showSapDetail && (
              <div className="px-2 pb-2">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/50">
                      <th className="py-1.5 px-3 text-left text-xs font-semibold text-slate-600">Description</th>
                      <th className="py-1.5 px-3 text-right text-xs font-semibold text-slate-600 w-24">Debit</th>
                      <th className="py-1.5 px-3 text-right text-xs font-semibold text-slate-600 w-24">Credit</th>
                      <th className="py-1.5 px-3 text-right text-xs font-semibold text-slate-600 w-24">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etlInvoice.lineItems.map((item, idx) => {
                      const net = item.debitAmount - item.creditAmount;
                      return (
                        <tr key={idx} className="border-b border-slate-100 text-sm hover:bg-white/50">
                          <td className="py-1.5 px-3 text-slate-700">
                            <div className="truncate max-w-md" title={item.description}>
                              {item.description || '(no description)'}
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-600">
                            {item.debitAmount > 0 ? formatCurrency(item.debitAmount) : '-'}
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-600">
                            {item.creditAmount > 0 ? formatCurrency(item.creditAmount) : '-'}
                          </td>
                          <td className="py-1.5 px-3 text-right font-medium text-slate-800">
                            {formatCurrency(net)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100/50 font-medium text-sm">
                      <td className="py-1.5 px-3 text-slate-700">Total</td>
                      <td className="py-1.5 px-3 text-right text-slate-700">
                        {formatCurrency(etlInvoice.lineItems.reduce((s, r) => s + r.debitAmount, 0))}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-700">
                        {formatCurrency(etlInvoice.lineItems.reduce((s, r) => s + r.creditAmount, 0))}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-800">
                        {formatCurrency(etlInvoice.computedAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {etlInvoice.allocationNote && (
                  <div className="px-3 py-1.5 text-xs text-slate-500 italic">
                    {etlInvoice.allocationNote}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Database Line Items (collapsible, for matched invoices) */}
          {hasSubLineItems && (
            <div className="border-t border-slate-200 bg-blue-50/30">
              <button
                onClick={() => setShowSubDetail(!showSubDetail)}
                className="w-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-blue-700 hover:bg-blue-50/50 transition-colors"
              >
                {showSubDetail ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                In Database ({matchType === 'MONTHLY_TOTAL' && supabaseGroup
                  ? `${supabaseGroup.length} invoices, ${supabaseGroup.reduce((s, i) => s + (i.lineItems?.length || 0), 0)} line items`
                  : `${supabaseInvoice!.lineItems.length} line items`
                })
              </button>
              {showSubDetail && (
                <div className="px-2 pb-2">
                  {/* For MONTHLY_TOTAL: show each invoice in the group */}
                  {matchType === 'MONTHLY_TOTAL' && supabaseGroup ? (
                    <div className="space-y-2">
                      {supabaseGroup.map((groupInv) => (
                        <div key={groupInv.id} className="border border-blue-200 rounded">
                          <div className="px-3 py-1.5 bg-blue-100/50 text-xs font-medium text-blue-800 flex justify-between">
                            <span>Invoice #{groupInv.invoice_number?.substring(0, 20) || 'N/A'} - {groupInv.invoice_date}</span>
                            <span>{formatCurrency(groupInv.total_amount)}</span>
                          </div>
                          {groupInv.lineItems && groupInv.lineItems.length > 0 && (
                            <table className="w-full">
                              <tbody>
                                {groupInv.lineItems.map((li) => (
                                  <tr key={li.id} className="border-b border-blue-50 text-sm">
                                    <td className="py-1 px-3 text-slate-700 truncate max-w-md">{li.description || '(no description)'}</td>
                                    <td className="py-1 px-3 text-right text-slate-600 w-24">{formatCurrency(li.total_amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      ))}
                      <div className="px-3 py-1.5 font-medium text-sm text-blue-900">
                        Group Total: {formatCurrency(supabaseGroup.reduce((s, i) => s + i.total_amount, 0))}
                      </div>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-blue-200 bg-blue-100/30">
                          <th className="py-1.5 px-3 text-left text-xs font-semibold text-blue-800">Description</th>
                          <th className="py-1.5 px-3 text-right text-xs font-semibold text-blue-800 w-20">Qty</th>
                          <th className="py-1.5 px-3 text-right text-xs font-semibold text-blue-800 w-24">Unit Price</th>
                          <th className="py-1.5 px-3 text-right text-xs font-semibold text-blue-800 w-24">Total</th>
                          <th className="py-1.5 px-3 text-right text-xs font-semibold text-blue-800 w-28">Period</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supabaseInvoice!.lineItems.map((li) => (
                          <tr key={li.id} className="border-b border-blue-100 text-sm hover:bg-white/50">
                            <td className="py-1.5 px-3 text-slate-700">
                              <div className="truncate max-w-md" title={li.description}>
                                {li.description || '(no description)'}
                              </div>
                            </td>
                            <td className="py-1.5 px-3 text-right text-slate-600">
                              {li.quantity ?? '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right text-slate-600">
                              {li.unit_price != null ? formatCurrency(li.unit_price) : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-medium text-slate-800">
                              {formatCurrency(li.total_amount)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-xs text-slate-500">
                              {li.period_start ? `${li.period_start.substring(0, 7)}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-blue-100/30 font-medium text-sm">
                          <td className="py-1.5 px-3 text-blue-800" colSpan={3}>Total</td>
                          <td className="py-1.5 px-3 text-right text-blue-900">
                            {formatCurrency(supabaseInvoice!.lineItems.reduce((s, li) => s + li.total_amount, 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
