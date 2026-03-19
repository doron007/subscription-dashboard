'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Check,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { SapImportAnalysis, ETLInvoice, SupabaseInvoice, InvoiceOverrides } from '@/lib/etl/types';
import { SapInvoiceRow } from './SapInvoiceRow';

type ResultTab = 'matched' | 'new' | 'supabase-only';
type SortField = 'vendor' | 'amount' | 'date' | 'matchType';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;
const BATCH_SIZE = 50;

interface SapMatchResultsProps {
  analysis: SapImportAnalysis;
  onRefetch: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function SapMatchResults({ analysis, onRefetch }: SapMatchResultsProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('matched');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('vendor');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  // Selection state per tab
  const [selectedMatched, setSelectedMatched] = useState<Set<string>>(new Set());
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set());

  // Override state for matched invoices
  const [overrides, setOverrides] = useState<Map<string, InvoiceOverrides>>(new Map());

  const handleOverride = useCallback((groupKey: string, newOverrides: InvoiceOverrides) => {
    setOverrides(prev => {
      const next = new Map(prev);
      next.set(groupKey, newOverrides);
      return next;
    });
  }, []);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: number } | null>(null);

  // Reset page when filters change
  const resetPage = useCallback(() => setPage(1), []);

  // Sorting helper
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    resetPage();
  };

  // Filtered + sorted matched results
  const filteredMatched = useMemo(() => {
    let items = [...analysis.matched];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (m) =>
          m.etl.supabaseVendor?.toLowerCase().includes(q) ||
          m.etl.sapVendor.toLowerCase().includes(q)
      );
    }

    if (matchTypeFilter !== 'all') {
      items = items.filter((m) => m.matchType === matchTypeFilter);
    }

    items.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'vendor':
          return dir * (a.etl.supabaseVendor || a.etl.sapVendor).localeCompare(b.etl.supabaseVendor || b.etl.sapVendor);
        case 'amount':
          return dir * (a.etl.computedAmount - b.etl.computedAmount);
        case 'date':
          return dir * a.etl.postingDate.localeCompare(b.etl.postingDate);
        case 'matchType': {
          const order: Record<string, number> = { EXACT: 0, CLOSE: 1, MONTH_MATCH: 2, MONTHLY_TOTAL: 3 };
          return dir * ((order[a.matchType] ?? 3) - (order[b.matchType] ?? 3));
        }
        default:
          return 0;
      }
    });

    return items;
  }, [analysis.matched, searchQuery, matchTypeFilter, sortField, sortDir]);

  // Filtered + sorted new results
  const filteredNew = useMemo(() => {
    let items = [...analysis.newInvoices];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (inv) =>
          inv.supabaseVendor?.toLowerCase().includes(q) ||
          inv.sapVendor.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'vendor':
          return dir * (a.supabaseVendor || a.sapVendor).localeCompare(b.supabaseVendor || b.sapVendor);
        case 'amount':
          return dir * (a.computedAmount - b.computedAmount);
        case 'date':
          return dir * a.postingDate.localeCompare(b.postingDate);
        default:
          return 0;
      }
    });

    return items;
  }, [analysis.newInvoices, searchQuery, sortField, sortDir]);

  // Filtered supabase-only
  const filteredSupabaseOnly = useMemo(() => {
    let items = [...analysis.supabaseOnly];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((inv) => inv.vendor_name.toLowerCase().includes(q));
    }

    items.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'vendor':
          return dir * a.vendor_name.localeCompare(b.vendor_name);
        case 'amount':
          return dir * (a.total_amount - b.total_amount);
        case 'date':
          return dir * a.invoice_date.localeCompare(b.invoice_date);
        default:
          return 0;
      }
    });

    return items;
  }, [analysis.supabaseOnly, searchQuery, sortField, sortDir]);

  // Current items based on active tab
  const currentItems = activeTab === 'matched' ? filteredMatched : activeTab === 'new' ? filteredNew : filteredSupabaseOnly;
  const totalPages = Math.max(1, Math.ceil(currentItems.length / PAGE_SIZE));
  const pagedItems = currentItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Selection helpers
  const currentSelection = activeTab === 'matched' ? selectedMatched : selectedNew;
  const setCurrentSelection = activeTab === 'matched' ? setSelectedMatched : setSelectedNew;

  const toggleSelectItem = (key: string) => {
    setCurrentSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    const keys =
      activeTab === 'matched'
        ? filteredMatched.map((m) => m.etl.groupKey)
        : filteredNew.map((inv) => inv.groupKey);
    setCurrentSelection(new Set(keys));
  };

  const deselectAll = () => {
    setCurrentSelection(new Set());
  };

  const totalSelected = selectedMatched.size + selectedNew.size;

  // Import handler
  const handleImportClick = () => {
    if (totalSelected === 0) return;
    setShowConfirmModal(true);
  };

  const handleConfirmImport = async () => {
    setShowConfirmModal(false);
    setIsImporting(true);
    setImportComplete(false);
    setImportResult(null);

    const matchedToImport = analysis.matched.filter((m) =>
      selectedMatched.has(m.etl.groupKey)
    );
    const newToImport = analysis.newInvoices.filter((inv) =>
      selectedNew.has(inv.groupKey)
    );

    // Build actions respecting overrides
    const allItems: { type: 'create' | 'update'; etl: ETLInvoice; supabaseId: string | null; overrides?: { billingMonth?: string; amountOverride?: number } }[] = [];

    for (const m of matchedToImport) {
      const ov = overrides.get(m.etl.groupKey);
      if (ov?.importAction === 'SKIP') continue;
      const actionType = ov?.importAction === 'CREATE' ? 'create' as const : 'update' as const;
      allItems.push({
        type: actionType,
        etl: m.etl,
        supabaseId: actionType === 'update' ? m.supabase.id : null,
        overrides: (ov?.billingMonth || ov?.amountOverride) ? {
          billingMonth: ov.billingMonth,
          amountOverride: ov.amountOverride,
        } : undefined,
      });
    }

    for (const inv of newToImport) {
      allItems.push({ type: 'create', etl: inv, supabaseId: null });
    }

    const totalBatches = Math.ceil(allItems.length / BATCH_SIZE);
    setImportProgress({ current: 0, total: allItems.length });

    let created = 0;
    let updated = 0;
    let errors = 0;

    try {
      for (let i = 0; i < totalBatches; i++) {
        const batch = allItems.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

        const actions = batch.map(item => ({
          type: item.type.toUpperCase() as 'CREATE' | 'UPDATE',
          etlInvoice: item.etl,
          targetInvoiceId: item.supabaseId || undefined,
          overrides: item.overrides,
        }));

        const response = await fetch('/api/sap/execute-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actions, batchIndex: i, totalBatches }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || `Batch ${i + 1} failed`);
        }

        const result = await response.json();
        created += result.created?.invoices || 0;
        updated += result.updated?.invoices || 0;
        errors += result.errors?.length || 0;

        setImportProgress({
          current: Math.min((i + 1) * BATCH_SIZE, allItems.length),
          total: allItems.length,
        });
      }

      setImportResult({ created, updated, errors });
      setImportComplete(true);
      setSelectedMatched(new Set());
      setSelectedNew(new Set());
    } catch (error) {
      console.error('SAP import error:', error);
      alert(`Import failed: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${
        sortField === field ? 'text-teal-700' : 'text-slate-600'
      } hover:text-teal-600`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Result sub-tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        <button
          onClick={() => { setActiveTab('matched'); resetPage(); }}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'matched'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Matched ({analysis.matched.length})
        </button>
        <button
          onClick={() => { setActiveTab('new'); resetPage(); }}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'new'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          New Records ({analysis.newInvoices.length})
        </button>
        <button
          onClick={() => { setActiveTab('supabase-only'); resetPage(); }}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'supabase-only'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          DB Only ({analysis.supabaseOnly.length})
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search vendor..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* Match type filter (only for matched tab) */}
        {activeTab === 'matched' && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={matchTypeFilter}
              onChange={(e) => { setMatchTypeFilter(e.target.value); resetPage(); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Match Types</option>
              <option value="EXACT">Exact</option>
              <option value="CLOSE">Close</option>
              <option value="MONTH_MATCH">Month Match</option>
              <option value="MONTHLY_TOTAL">Monthly Total</option>
            </select>
          </div>
        )}

        {/* Select all / deselect */}
        {activeTab !== 'supabase-only' && (
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={deselectAll}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              Deselect All
            </button>
          </div>
        )}
      </div>

      {/* Sort headers */}
      <div className="flex items-center gap-6 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
        <div className="w-4" /> {/* checkbox spacer */}
        <div className="w-4" /> {/* expand spacer */}
        <div className="flex-1">
          <SortButton field="vendor" label="Vendor" />
        </div>
        <div className="w-28 text-right">
          <SortButton field="amount" label="Amount" />
        </div>
        <div className="w-28 text-right">
          <SortButton field="date" label="Date" />
        </div>
        {activeTab === 'matched' && (
          <div className="w-28 text-right">
            <SortButton field="matchType" label="Match" />
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="space-y-2">
        {activeTab === 'matched' &&
          (pagedItems as typeof filteredMatched).map((m) => (
            <SapInvoiceRow
              key={m.etl.groupKey}
              etlInvoice={m.etl}
              supabaseInvoice={m.supabase}
              supabaseGroup={m.supabaseGroup}
              matchType={m.matchType}
              amountDiff={m.amountDiff}
              isSelected={selectedMatched.has(m.etl.groupKey)}
              onToggleSelect={() => toggleSelectItem(m.etl.groupKey)}
              overrides={overrides.get(m.etl.groupKey)}
              onOverride={handleOverride}
            />
          ))}

        {activeTab === 'new' &&
          (pagedItems as typeof filteredNew).map((inv) => (
            <SapInvoiceRow
              key={inv.groupKey}
              etlInvoice={inv}
              isNew
              isSelected={selectedNew.has(inv.groupKey)}
              onToggleSelect={() => toggleSelectItem(inv.groupKey)}
              overrides={overrides.get(inv.groupKey)}
              onOverride={handleOverride}
            />
          ))}

        {activeTab === 'supabase-only' &&
          (pagedItems as typeof filteredSupabaseOnly).map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 truncate">
                  {inv.vendor_name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  #{inv.invoice_number} &bull; {inv.line_item_count} line items
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-semibold text-slate-800">
                  {formatCurrency(inv.total_amount)}
                </div>
                <div className="text-xs text-slate-500">{inv.invoice_date}</div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                DB Only
              </span>
            </div>
          ))}

        {currentItems.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p className="font-medium">No results found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, currentItems.length)} of{' '}
            {currentItems.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 min-w-[80px] text-center">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky footer with import button */}
      {activeTab !== 'supabase-only' && (
        <div className="sticky bottom-0 bg-white border-t border-slate-200 -mx-1 px-4 py-3 flex items-center justify-between rounded-b-xl shadow-lg">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{totalSelected}</span>{' '}
            invoice{totalSelected !== 1 ? 's' : ''} selected
            {(() => {
              let creates = selectedNew.size;
              let updates = 0;
              selectedMatched.forEach(key => {
                const ov = overrides.get(key);
                if (ov?.importAction === 'SKIP') return;
                if (ov?.importAction === 'CREATE') creates++;
                else updates++;
              });
              return (
                <>
                  {updates > 0 && <span className="text-slate-400 ml-2">({updates} updates)</span>}
                  {creates > 0 && <span className="text-slate-400 ml-2">({creates} new)</span>}
                </>
              );
            })()}
          </div>

          {isImporting ? (
            <div className="flex items-center gap-3">
              <div className="w-48 bg-slate-200 rounded-full h-2">
                <div
                  className="bg-teal-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-sm text-slate-600">
                {importProgress.current}/{importProgress.total}
              </span>
              <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
            </div>
          ) : (
            <button
              onClick={handleImportClick}
              disabled={totalSelected === 0}
              className="px-4 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Import Selected ({totalSelected})
            </button>
          )}
        </div>
      )}

      {/* Import complete banner */}
      {importComplete && importResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-green-800">Import Complete</p>
            <p className="text-sm text-green-700 mt-1">
              Created {importResult.created} invoices, updated {importResult.updated}
              {importResult.errors > 0 && (
                <span className="text-red-600">
                  , {importResult.errors} errors
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onRefetch}
            className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refetch
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Confirm Import</h3>
                <p className="text-slate-500 mt-1 text-sm">
                  {(() => {
                    let creates = selectedNew.size;
                    let updates = 0;
                    let skips = 0;
                    selectedMatched.forEach(key => {
                      const ov = overrides.get(key);
                      if (ov?.importAction === 'SKIP') skips++;
                      else if (ov?.importAction === 'CREATE') creates++;
                      else updates++;
                    });
                    return (
                      <>
                        This will create{' '}
                        <span className="font-semibold text-slate-800">{creates} new</span>
                        {updates > 0 && <>, update <span className="font-semibold text-slate-800">{updates} existing</span></>}
                        {skips > 0 && <>, skip <span className="font-semibold text-slate-400">{skips}</span></>}
                        . Proceed?
                      </>
                    );
                  })()}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-4 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700"
              >
                Yes, Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
