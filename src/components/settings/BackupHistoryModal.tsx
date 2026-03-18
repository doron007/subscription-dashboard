'use client';

import { useState } from 'react';
import {
  X, ChevronDown, ChevronRight, Loader2, AlertTriangle,
  RotateCcw, GitCompare, CheckCircle2,
} from 'lucide-react';
import type { BackupMetadata, ChangeLogSummary } from '@/lib/backup/types';

interface BackupHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  backups: BackupMetadata[];
  onRefresh: () => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRowCounts(counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
  return `${total.toLocaleString()} rows`;
}

function ChangesSummary({ summary }: { summary: ChangeLogSummary }) {
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  if (summary.totalChanges === 0) {
    return (
      <div className="p-4 text-center text-sm text-slate-500 bg-emerald-50 rounded-lg">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
        No changes since this backup.
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-3">
      <div className="text-sm font-medium text-slate-700">
        {summary.totalChanges} change{summary.totalChanges !== 1 ? 's' : ''} since backup
      </div>
      {Object.entries(summary.tables).map(([tableName, info]) => {
        const hasChanges = info.added + info.modified + info.removed > 0;
        if (!hasChanges) return null;

        const isExpanded = expandedTable === tableName;

        return (
          <div key={tableName} className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedTable(isExpanded ? null : tableName)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-sm font-medium text-slate-800">{tableName}</span>
              <div className="flex gap-2 ml-auto text-xs">
                {info.added > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    +{info.added} added
                  </span>
                )}
                {info.modified > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {info.modified} modified
                  </span>
                )}
                {info.removed > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    -{info.removed} removed
                  </span>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600 w-24">Action</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">ID</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">Field</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">Old</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-600">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.details.slice(0, 100).map((entry, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="px-3 py-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            entry.action === 'added'
                              ? 'bg-emerald-100 text-emerald-700'
                              : entry.action === 'removed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-500 truncate max-w-[120px]">
                          {entry.sourceId.slice(0, 8)}...
                        </td>
                        <td className="px-3 py-1.5 text-slate-700">
                          {entry.field || (entry.record ? summarizeRecord(entry.record) : '-')}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500 truncate max-w-[120px]">
                          {entry.action === 'modified' ? formatValue(entry.oldValue) : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 truncate max-w-[120px]">
                          {entry.action === 'modified' ? formatValue(entry.newValue) : '-'}
                        </td>
                      </tr>
                    ))}
                    {info.details.length > 100 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-center text-xs text-slate-500">
                          ...and {info.details.length - 100} more entries
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function summarizeRecord(record: Record<string, unknown>): string {
  const name = record.name || record.description || record.invoice_number;
  if (name) return String(name);
  return '(record)';
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'number') return val.toLocaleString();
  return String(val);
}

export function BackupHistoryModal({
  isOpen,
  onClose,
  backups,
  onRefresh,
}: BackupHistoryModalProps) {
  const [comparingId, setComparingId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ChangeLogSummary | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCompare = async (backupId: string) => {
    setError(null);
    setComparison(null);
    setComparingId(backupId);

    try {
      const res = await fetch('/api/backup/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.details || errData.error);
      }

      const data = await res.json();
      setComparison(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setComparingId(null);
    }
  };

  const handleRestore = async (backupId: string) => {
    setError(null);
    setRestoringId(backupId);

    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId, confirm: true }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.details || errData.error);
      }

      const data = await res.json();
      alert(
        `Restore completed successfully.\nA pre-restore safety backup was created (ID: ${data.preRestoreBackupId.slice(0, 8)}...).`
      );
      setConfirmRestoreId(null);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Backup History</h2>
              <p className="text-sm text-slate-500">
                {backups.length} backup{backups.length !== 1 ? 's' : ''} stored
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-700">{error}</div>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Backup list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {backups.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p className="font-medium">No backups yet</p>
                <p className="text-sm mt-1">Create your first backup from the Settings page.</p>
              </div>
            ) : (
              backups.map((backup) => (
                <div key={backup.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {formatDate(backup.created_at)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          backup.trigger_type === 'auto'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {backup.trigger_type}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{backup.label}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatRowCounts(backup.row_counts)}
                        {' | '}
                        ID: {backup.id.slice(0, 8)}...
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCompare(backup.id)}
                        disabled={comparingId === backup.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {comparingId === backup.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <GitCompare className="w-4 h-4" />
                        )}
                        Compare
                      </button>

                      {confirmRestoreId === backup.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRestore(backup.id)}
                            disabled={restoringId === backup.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {restoringId === backup.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <AlertTriangle className="w-4 h-4" />
                            )}
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmRestoreId(null)}
                            className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRestoreId(backup.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Restore
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline comparison results */}
                  {comparison && comparison.backupId === backup.id && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <ChangesSummary summary={comparison} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end p-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
