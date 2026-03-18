'use client';

import { useState, useCallback } from 'react';
import {
  Database,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  FileText,
  Plus,
} from 'lucide-react';
import type { SapImportAnalysis } from '@/lib/etl/types';
import { SapMatchResults } from './SapMatchResults';

type TabState = 'idle' | 'fetching' | 'done' | 'error';

const currentYear = new Date().getFullYear();
const yearOptions = Array.from(
  new Set([2025, 2026, currentYear])
).sort((a, b) => b - a);

const PHASE_MESSAGES = [
  'Connecting to SAP OData...',
  'Fetching GL journal entries...',
  'Classifying rows...',
  'Reconstructing invoices...',
  'Matching against Supabase...',
  'Preparing results...',
];

export function SapImportTab() {
  const [state, setState] = useState<TabState>('idle');
  const [year, setYear] = useState(currentYear);
  const [analysis, setAnalysis] = useState<SapImportAnalysis | null>(null);
  const [error, setError] = useState<string>('');
  const [phaseIndex, setPhaseIndex] = useState(0);

  const fetchSapData = useCallback(async () => {
    setState('fetching');
    setError('');
    setPhaseIndex(0);

    // Cycle through phase messages to indicate progress
    const phaseTimer = setInterval(() => {
      setPhaseIndex((prev) => Math.min(prev + 1, PHASE_MESSAGES.length - 1));
    }, 3000);

    try {
      const response = await fetch('/api/sap/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      });

      clearInterval(phaseTimer);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || err.details || `Analysis failed (${response.status})`);
      }

      const data: SapImportAnalysis = await response.json();
      setAnalysis(data);
      setState('done');
    } catch (err) {
      clearInterval(phaseTimer);
      setError((err as Error).message);
      setState('error');
    }
  }, [year]);

  const handleRefetch = useCallback(() => {
    setAnalysis(null);
    fetchSapData();
  }, [fetchSapData]);

  return (
    <div className="space-y-6">
      {/* Info banner */}
      {state === 'idle' && (
        <>
          <div className="bg-teal-50 border border-teal-100 rounded-lg p-4">
            <p className="text-teal-800 text-sm">
              <strong>SAP GL Sync</strong> -- Connect to your SAP system via OData to fetch
              General Ledger journal entries, reconstruct invoices, and compare them against
              existing records in your dashboard. No data is modified until you explicitly
              import.
            </p>
          </div>

          {/* Year selector + Fetch button */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mb-6">
                <Database className="w-8 h-8 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Fetch SAP GL Data
              </h3>
              <p className="text-slate-500 max-w-sm mb-6">
                Select a fiscal year and fetch journal entries from SAP. The ETL pipeline
                will classify, group, and match invoices automatically.
              </p>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="sap-year"
                    className="text-sm font-medium text-slate-700"
                  >
                    Fiscal Year:
                  </label>
                  <select
                    id="sap-year"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={fetchSapData}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  Fetch from SAP
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Fetching state */}
      {state === 'fetching' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="w-12 h-12 text-teal-600 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-slate-900">
              {PHASE_MESSAGES[phaseIndex]}
            </h3>
            <p className="text-slate-500 mt-2 text-sm">
              Fetching {year} data. This may take a minute for large datasets.
            </p>

            {/* Phase indicators */}
            <div className="flex items-center gap-2 mt-6">
              {PHASE_MESSAGES.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx <= phaseIndex ? 'bg-teal-500' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Failed to Fetch SAP Data
            </h3>
            <p className="text-slate-500 max-w-md mb-1">{error}</p>
            <p className="text-xs text-slate-400 mb-6">
              Check that SAP OData credentials are configured and the service is reachable.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setState('idle')}
                className="border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={fetchSapData}
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done state - summary + results */}
      {state === 'done' && analysis && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-medium">SAP Invoices</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {analysis.sapMeta.etlInvoiceCount}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                from {analysis.sapMeta.totalGLRows.toLocaleString()} GL rows
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-green-200">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Matched</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {analysis.matched.length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                existing invoices found
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-teal-200">
              <div className="flex items-center gap-2 text-teal-600 mb-1">
                <Plus className="w-4 h-4" />
                <span className="text-xs font-medium">New</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {analysis.newInvoices.length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                not yet in dashboard
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Database className="w-4 h-4" />
                <span className="text-xs font-medium">Supabase Only</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {analysis.supabaseOnly.length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                not found in SAP
              </div>
            </div>
          </div>

          {/* Warnings */}
          {analysis.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-amber-800">Warnings</div>
                  <ul className="text-sm text-amber-700 mt-1 space-y-1">
                    {analysis.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {analysis.warnings.length > 5 && (
                      <li className="text-amber-600">
                        ...and {analysis.warnings.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Timing info */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Fetched in {(analysis.sapMeta.fetchDurationMs / 1000).toFixed(1)}s &bull;{' '}
              {analysis.sapMeta.dataYear} fiscal year
            </p>
            <button
              onClick={handleRefetch}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Refetch
            </button>
          </div>

          {/* Match results table */}
          <SapMatchResults analysis={analysis} onRefetch={handleRefetch} />
        </>
      )}
    </div>
  );
}
