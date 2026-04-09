'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Check,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Calendar,
  ExternalLink,
  Save,
} from 'lucide-react';
import type { SapImportAnalysis, ETLInvoice, SupabaseInvoice, InvoiceOverrides, ETLOverride, NeedsReviewItem } from '@/lib/etl/types';
import { SapInvoiceRow } from './SapInvoiceRow';
import { classifyAllMatches } from '@/lib/etl/classify-match';

type ResultTab = 'matched' | 'new' | 'supabase-only';
type SortField = 'vendor' | 'amount' | 'date' | 'matchType';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;
const BATCH_SIZE = 50;

interface SapMatchResultsProps {
  analysis: SapImportAnalysis;
  onRefetch: () => void;
  onAnalysisUpdate?: (updated: Partial<SapImportAnalysis>) => void;
  activeTabOverride?: ResultTab;
  onTabChange?: (tab: ResultTab) => void;
  paymentStatusFilterOverride?: string;
  onPaymentStatusFilterChange?: (filter: string) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function SapMatchResults({ analysis, onRefetch, onAnalysisUpdate, activeTabOverride, onTabChange, paymentStatusFilterOverride, onPaymentStatusFilterChange }: SapMatchResultsProps) {
  const [internalTab, setInternalTab] = useState<ResultTab>('matched');
  const activeTab = activeTabOverride ?? internalTab;
  const setActiveTab = (tab: ResultTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string>('all');
  const [internalPaymentStatusFilter, setInternalPaymentStatusFilter] = useState<string>('all');
  const paymentStatusFilter = paymentStatusFilterOverride ?? internalPaymentStatusFilter;
  const setPaymentStatusFilter = (val: string) => {
    setInternalPaymentStatusFilter(val);
    onPaymentStatusFilterChange?.(val);
  };
  const [sortField, setSortField] = useState<SortField>('vendor');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  // Reset page when parent drives tab or filter switch
  useEffect(() => {
    setPage(1);
  }, [activeTabOverride, paymentStatusFilterOverride]);

  // Selection state per tab
  const [selectedMatched, setSelectedMatched] = useState<Set<string>>(new Set());
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set());

  // Override state — initialized from persisted overrides
  const [overrides, setOverrides] = useState<Map<string, InvoiceOverrides>>(() => {
    const initial = new Map<string, InvoiceOverrides>();
    if (analysis.overrides) {
      for (const [key, ov] of Object.entries(analysis.overrides)) {
        if (ov.importedAt) continue; // Skip already-imported overrides
        initial.set(key, {
          billingMonth: ov.billingMonthOverride,
          importAction: ov.importAction as InvoiceOverrides['importAction'],
          amountOverride: ov.amountOverride,
          paymentStatusOverride: ov.paymentStatusOverride,
        });
      }
    }
    return initial;
  });

  // Classify matched items into confirmed vs needs-review
  const { confirmed, needsReview } = useMemo(
    () => classifyAllMatches(analysis.matched, analysis.overrides || {}, analysis.vendorProfiles),
    [analysis.matched, analysis.overrides, analysis.vendorProfiles]
  );
  const [confirmedExpanded, setConfirmedExpanded] = useState(false);

  // Debounced persistence of overrides
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persistOverride = useCallback((groupKey: string, ov: InvoiceOverrides, etl: ETLInvoice) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      fetch('/api/sap/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupKey,
          vendorName: etl.supabaseVendor || etl.sapVendor,
          dataYear: analysis.sapMeta.dataYear,
          billingMonthOverride: ov.billingMonth || null,
          amountOverride: ov.amountOverride || null,
          importAction: ov.importAction || 'PENDING',
          sapAmount: etl.computedAmount !== etl.rawAmount ? etl.computedAmount : etl.rawAmount,
          paymentStatusOverride: ov.paymentStatusOverride || null,
        }),
      }).catch(err => console.error('Failed to persist override:', err));
    }, 500);
  }, [analysis.sapMeta.dataYear]);

  const clearAllOverrides = useCallback(async () => {
    if (!confirm('Clear all saved decisions? This cannot be undone.')) return;
    const year = analysis.sapMeta.dataYear;
    const res = await fetch(`/api/sap/overrides?year=${year}`);
    const { overrides: all } = await res.json();
    for (const ov of all || []) {
      if (!ov.imported_at) {
        await fetch(`/api/sap/overrides/${ov.id}`, { method: 'DELETE' });
      }
    }
    setOverrides(new Map());
  }, [analysis.sapMeta.dataYear]);

  const [isRematching, setIsRematching] = useState(false);

  const triggerRematch = useCallback(async (updatedOverrides: Map<string, InvoiceOverrides>) => {
    if (!onAnalysisUpdate) return;
    setIsRematching(true);
    try {
      // Build ETL invoices with overridden billing months applied
      const allEtl = [
        ...analysis.matched.map(m => m.etl),
        ...analysis.newInvoices,
      ];
      const adjustedEtl = allEtl.map(etl => {
        const ov = updatedOverrides.get(etl.groupKey);
        if (ov?.billingMonth) {
          return { ...etl, billingMonth: ov.billingMonth };
        }
        return etl;
      });

      const res = await fetch('/api/sap/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etlInvoices: adjustedEtl,
          dataYear: analysis.sapMeta.dataYear,
        }),
      });
      if (!res.ok) throw new Error('Re-match failed');
      const data = await res.json();
      onAnalysisUpdate({
        matched: data.matched,
        newInvoices: data.newInvoices,
        supabaseOnly: data.supabaseOnly,
      });
    } catch (err) {
      console.error('Rematch error:', err);
    } finally {
      setIsRematching(false);
    }
  }, [analysis, onAnalysisUpdate]);

  const handleOverride = useCallback((groupKey: string, newOverrides: InvoiceOverrides, etl?: ETLInvoice) => {
    setOverrides(prev => {
      const next = new Map(prev);
      const old = prev.get(groupKey);
      next.set(groupKey, newOverrides);

      // Persist to DB (debounced)
      if (etl) {
        persistOverride(groupKey, newOverrides, etl);
      }

      // If billing month changed, trigger re-match
      if (newOverrides.billingMonth && newOverrides.billingMonth !== old?.billingMonth) {
        setTimeout(() => triggerRematch(next), 0);
      }

      return next;
    });
  }, [triggerRematch, persistOverride]);

  // Confirm handler — persists CONFIRM action with imported_at immediately (no debounce)
  const handleConfirm = useCallback(async (groupKey: string, etl: ETLInvoice) => {
    // Persist to DB immediately with imported_at set
    try {
      await fetch('/api/sap/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupKey,
          vendorName: etl.supabaseVendor || etl.sapVendor,
          dataYear: analysis.sapMeta.dataYear,
          importAction: 'CONFIRM',
          sapAmount: etl.computedAmount !== etl.rawAmount ? etl.computedAmount : etl.rawAmount,
          setImportedAt: true,
        }),
      });
      // Update local override state so classification recomputes
      setOverrides(prev => {
        const next = new Map(prev);
        next.set(groupKey, { importAction: 'CONFIRM' });
        return next;
      });
      // Update analysis overrides so classifyAllMatches picks it up
      if (onAnalysisUpdate) {
        const updatedOverrides = { ...analysis.overrides };
        updatedOverrides[groupKey] = {
          ...(updatedOverrides[groupKey] || { id: '', groupKey, vendorName: etl.supabaseVendor || etl.sapVendor, dataYear: analysis.sapMeta.dataYear, importAction: 'CONFIRM', createdAt: '', updatedAt: '' }),
          importAction: 'CONFIRM',
          importedAt: new Date().toISOString(),
        };
        onAnalysisUpdate({ overrides: updatedOverrides });
      }
    } catch (err) {
      console.error('Failed to confirm:', err);
    }
  }, [analysis.sapMeta.dataYear, analysis.overrides, onAnalysisUpdate]);

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

  // Filtered + sorted needs-review results (confirmed items shown separately)
  const filteredMatched = useMemo(() => {
    let items: NeedsReviewItem[] = [...needsReview];

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

    if (paymentStatusFilter !== 'all') {
      items = items.filter((m) => (m.etl.paymentStatus || 'Unknown') === paymentStatusFilter);
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
  }, [needsReview, searchQuery, matchTypeFilter, paymentStatusFilter, sortField, sortDir]);

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

    if (paymentStatusFilter !== 'all') {
      items = items.filter((inv) => (inv.paymentStatus || 'Unknown') === paymentStatusFilter);
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
  }, [analysis.newInvoices, searchQuery, paymentStatusFilter, sortField, sortDir]);

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
        ? filteredMatched.map((m) => m.etl.groupKey) // Only needs-review items (confirmed excluded)
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
      const ov = overrides.get(inv.groupKey);
      allItems.push({
        type: 'create',
        etl: inv,
        supabaseId: null,
        overrides: (ov?.billingMonth || ov?.amountOverride) ? {
          billingMonth: ov.billingMonth,
          amountOverride: ov.amountOverride,
        } : undefined,
      });
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
          body: JSON.stringify({ actions, batchIndex: i, totalBatches, dataYear: analysis.sapMeta.dataYear }),
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
      {/* Result sub-tabs — only show when not controlled by parent cards */}
      {!activeTabOverride && (
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => { setActiveTab('matched'); resetPage(); }}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'matched'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Matched ({analysis.matched.length}{needsReview.length > 0 ? ` \u00b7 ${needsReview.length} to review` : ''})
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
      )}

      {/* Rematching indicator */}
      {isRematching && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-200">
          <Loader2 className="w-4 h-4 animate-spin" />
          Re-matching with updated billing periods...
        </div>
      )}

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

        {/* Payment status filter */}
        {activeTab !== 'supabase-only' && (
          <div className="flex items-center gap-2">
            <select
              value={paymentStatusFilter}
              onChange={(e) => { setPaymentStatusFilter(e.target.value); resetPage(); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Payment Status</option>
              <option value="Paid">Paid</option>
              <option value="Not Paid">Not Paid</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Unknown">Unknown</option>
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
            {Object.keys(analysis.overrides || {}).length > 0 && (
              <button
                onClick={clearAllOverrides}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear Saved Decisions
              </button>
            )}
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
        {/* Confirmed section (matched tab only) */}
        {activeTab === 'matched' && confirmed.length > 0 && (() => {
          const isFilteringPaymentStatus = paymentStatusFilter !== 'all';
          const filteredConfirmed = isFilteringPaymentStatus
            ? confirmed.filter(m => (m.etl.paymentStatus || 'Unknown') === paymentStatusFilter)
            : confirmed;
          const isAutoExpanded = isFilteringPaymentStatus && filteredConfirmed.length > 0;
          const showExpanded = confirmedExpanded || isAutoExpanded;
          if (isFilteringPaymentStatus && filteredConfirmed.length === 0) return null;
          return (
          <div className="rounded-lg border border-green-200 overflow-hidden">
            <button
              onClick={() => setConfirmedExpanded(!confirmedExpanded)}
              className="w-full flex items-center gap-3 px-4 py-2.5 bg-green-50 hover:bg-green-100/70 transition-colors text-left"
            >
              {showExpanded ? <ChevronDown className="w-4 h-4 text-green-600" /> : <ChevronRight className="w-4 h-4 text-green-600" />}
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                Confirmed &mdash; {filteredConfirmed.length}{isFilteringPaymentStatus ? ` of ${confirmed.length}` : ''} invoices
              </span>
              <span className="text-xs text-green-600 ml-1">
                {isFilteringPaymentStatus
                  ? `(filtered by ${paymentStatusFilter} payment status)`
                  : '(previously imported, no action needed)'}
              </span>
            </button>
            {showExpanded && (
              <div className="space-y-1 p-2 bg-green-50/30">
                {filteredConfirmed.map((m) => (
                  <SapInvoiceRow
                    key={m.etl.groupKey}
                    etlInvoice={m.etl}
                    supabaseInvoice={m.supabase}
                    supabaseGroup={m.supabaseGroup}
                    matchType={m.matchType}
                    amountDiff={m.amountDiff}
                    isSelected={false}
                    onToggleSelect={() => {}}
                    readOnly
                    overrides={overrides.get(m.etl.groupKey)}
                    onOverride={handleOverride}
                    persistedOverride={analysis.overrides?.[m.etl.groupKey]}
                  />
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {/* Needs Review section header (matched tab only, when there are confirmed items too) */}
        {activeTab === 'matched' && confirmed.length > 0 && needsReview.length > 0 && (() => {
          const manualEntryCount = needsReview.filter(
            m => m.reviewReasons.length === 1 && m.reviewReasons[0] === 'NO_SAP_HISTORY'
          ).length;
          return (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 flex-wrap">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-800">
                Needs Review &mdash; {filteredMatched.length} invoices
              </span>
              <span className="text-xs text-amber-600 ml-1">
                (differences detected, action may be needed)
              </span>
              {manualEntryCount > 0 && (
                <button
                  onClick={async () => {
                    const items = needsReview.filter(
                      m => m.reviewReasons.length === 1 && m.reviewReasons[0] === 'NO_SAP_HISTORY'
                    );
                    if (!confirm(`Confirm ${items.length} manual entries as matching SAP? This marks them as reviewed — no data is changed.`)) return;
                    // Fire all API calls in parallel
                    await Promise.all(items.map(item =>
                      fetch('/api/sap/overrides', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          groupKey: item.etl.groupKey,
                          vendorName: item.etl.supabaseVendor || item.etl.sapVendor,
                          dataYear: analysis.sapMeta.dataYear,
                          importAction: 'CONFIRM',
                          sapAmount: item.etl.computedAmount !== item.etl.rawAmount ? item.etl.computedAmount : item.etl.rawAmount,
                          setImportedAt: true,
                        }),
                      })
                    ));
                    // Batch update local overrides state
                    setOverrides(prev => {
                      const next = new Map(prev);
                      for (const item of items) {
                        next.set(item.etl.groupKey, { importAction: 'CONFIRM' });
                      }
                      return next;
                    });
                    // Single batch update to analysis overrides
                    if (onAnalysisUpdate) {
                      const updatedOverrides = { ...analysis.overrides };
                      const now = new Date().toISOString();
                      for (const item of items) {
                        updatedOverrides[item.etl.groupKey] = {
                          ...(updatedOverrides[item.etl.groupKey] || { id: '', groupKey: item.etl.groupKey, vendorName: item.etl.supabaseVendor || item.etl.sapVendor, dataYear: analysis.sapMeta.dataYear, importAction: 'CONFIRM', createdAt: '', updatedAt: '' }),
                          importAction: 'CONFIRM',
                          importedAt: now,
                        };
                      }
                      onAnalysisUpdate({ overrides: updatedOverrides });
                    }
                  }}
                  className="ml-auto px-2.5 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Confirm All Manual Entries ({manualEntryCount})
                </button>
              )}
            </div>
          );
        })()}

        {/* Needs Review items (matched tab) */}
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
              persistedOverride={analysis.overrides?.[m.etl.groupKey]}
              reviewReasons={m.reviewReasons}
              suggestion={m.suggestion}
              onConfirm={handleConfirm}
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
              persistedOverride={analysis.overrides?.[inv.groupKey]}
            />
          ))}

        {activeTab === 'supabase-only' &&
          (pagedItems as typeof filteredSupabaseOnly).map((inv) => (
            <DbOnlyRow
              key={inv.id}
              invoice={inv}
              formatCurrency={formatCurrency}
              onRefetch={onRefetch}
            />
          ))}

        {currentItems.length === 0 && !(activeTab === 'matched' && confirmed.length > 0 && filteredMatched.length === 0) && (
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

// ─── DB Only Row with Actions ───────────────────────────────────────────────

function DbOnlyRow({
  invoice,
  formatCurrency,
  onRefetch,
}: {
  invoice: SupabaseInvoice;
  formatCurrency: (n: number) => string;
  onRefetch: () => void;
}) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [newDate, setNewDate] = useState(invoice.invoice_date);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefetch();
      } else {
        alert('Failed to delete invoice');
      }
    } catch {
      alert('Failed to delete invoice');
    } finally {
      setBusy(false);
      setShowConfirmDelete(false);
    }
  };

  const handleDateSave = async () => {
    if (newDate === invoice.invoice_date) {
      setEditingDate(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceDate: newDate }),
      });
      if (res.ok) {
        onRefetch();
      } else {
        alert('Failed to update date');
      }
    } catch {
      alert('Failed to update date');
    } finally {
      setBusy(false);
      setEditingDate(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:shadow-sm transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-800 truncate">{invoice.vendor_name}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          #{invoice.invoice_number?.substring(0, 20) || 'N/A'} &bull; {invoice.line_item_count} line items
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-semibold text-slate-800">{formatCurrency(invoice.total_amount)}</div>
        {editingDate ? (
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="text-xs border border-slate-300 rounded px-1 py-0.5 w-28"
            />
            <button onClick={handleDateSave} disabled={busy} className="text-green-600 hover:text-green-700">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setEditingDate(false); setNewDate(invoice.invoice_date); }} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-500">{invoice.invoice_date}</div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => setEditingDate(true)}
          title="Edit date"
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowConfirmDelete(true)}
          title="Delete invoice"
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Delete confirmation */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowConfirmDelete(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 mb-2">Delete Invoice?</h3>
            <p className="text-sm text-slate-600 mb-1">
              <strong>{invoice.vendor_name}</strong> &mdash; {formatCurrency(invoice.total_amount)}
            </p>
            <p className="text-xs text-slate-500 mb-4">
              This will permanently delete the invoice and its {invoice.line_item_count} line items.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirmDelete(false)} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={handleDelete} disabled={busy} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {busy ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
