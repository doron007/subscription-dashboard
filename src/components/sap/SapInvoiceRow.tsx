'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ETLInvoice, SupabaseInvoice } from '@/lib/etl/types';

interface SapInvoiceRowProps {
  etlInvoice: ETLInvoice;
  supabaseInvoice?: SupabaseInvoice | null;
  matchType?: 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'NONE';
  amountDiff?: number;
  isNew?: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
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
  matchType,
  amountDiff,
  isNew = false,
  isSelected,
  onToggleSelect,
}: SapInvoiceRowProps) {
  const [expanded, setExpanded] = useState(false);

  const badgeType = isNew ? 'NEW' : (matchType || 'NONE');
  const hasLargeDiff = amountDiff !== undefined && Math.abs(amountDiff) > 50;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Main row */}
      <div
        className={`flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors ${
          hasLargeDiff && !isNew ? 'bg-red-50/30' : 'bg-white'
        }`}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
        />

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-slate-600 flex-shrink-0"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Vendor name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 truncate">
              {etlInvoice.supabaseVendor || etlInvoice.sapVendor}
            </span>
            <MatchBadge matchType={badgeType} />
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {etlInvoice.billingMonth} &bull; {etlInvoice.lineItems.length} line items
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
                amountDiff === 0
                  ? 'text-green-600'
                  : hasLargeDiff
                  ? 'text-red-600'
                  : 'text-yellow-600'
              }`}
            >
              {amountDiff !== undefined && amountDiff !== 0 && (
                <>
                  {amountDiff > 0 ? '+' : ''}
                  {formatCurrency(amountDiff)}
                </>
              )}
              {amountDiff === 0 && 'Match'}
            </div>
          </div>
        )}
      </div>

      {/* Expanded line items */}
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/50">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/50">
                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600">
                  Description
                </th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-slate-600 w-28">
                  Debit
                </th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-slate-600 w-28">
                  Credit
                </th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-slate-600 w-28">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {etlInvoice.lineItems.map((item, idx) => {
                const net = item.debitAmount - item.creditAmount;
                return (
                  <tr
                    key={idx}
                    className="border-b border-slate-100 text-sm hover:bg-white/50"
                  >
                    <td className="py-2 px-3 text-slate-700">
                      <div className="truncate max-w-md" title={item.description}>
                        {item.description || '(no description)'}
                      </div>
                      {item.classification !== 'VENDOR_DEBIT' && (
                        <span className="text-xs text-slate-400">
                          {item.classification}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {item.debitAmount > 0 ? formatCurrency(item.debitAmount) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {item.creditAmount > 0 ? formatCurrency(item.creditAmount) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-800">
                      {formatCurrency(net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/50 font-medium text-sm">
                <td className="py-2 px-3 text-slate-700">Total</td>
                <td className="py-2 px-3 text-right text-slate-700">
                  {formatCurrency(
                    etlInvoice.lineItems.reduce((s, r) => s + r.debitAmount, 0)
                  )}
                </td>
                <td className="py-2 px-3 text-right text-slate-700">
                  {formatCurrency(
                    etlInvoice.lineItems.reduce((s, r) => s + r.creditAmount, 0)
                  )}
                </td>
                <td className="py-2 px-3 text-right text-slate-800">
                  {formatCurrency(etlInvoice.computedAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
          {etlInvoice.allocationNote && (
            <div className="px-3 py-2 text-xs text-slate-500 italic border-t border-slate-100">
              {etlInvoice.allocationNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
