'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database, Loader2, Clock, HardDrive } from 'lucide-react';
import { BackupHistoryModal } from './BackupHistoryModal';
import type { BackupMetadata } from '@/lib/backup/types';
import { DEFAULT_BACKUP_CONFIG } from '@/lib/backup/types';

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BackupSection() {
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/backup/list');
      if (!res.ok) throw new Error('Failed to fetch backups');
      const data = await res.json();
      setBackups(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleBackupNow = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Manual backup from Settings' }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.details || errData.error);
      }
      await fetchBackups();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const latestBackup = backups[0] || null;

  return (
    <>
      <div className="p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <Database className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-900">Data Backup & Recovery</h3>
          <p className="text-sm text-slate-500 mt-1">
            Snapshot all subscription data. Auto-backups trigger before imports when the last backup is older than{' '}
            {DEFAULT_BACKUP_CONFIG.autoBackupIntervalDays} days.
          </p>

          {error && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading backup status...
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {/* Status row */}
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {latestBackup ? (
                    <span>
                      Last backup: {formatRelativeDate(latestBackup.created_at)}{' '}
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        latestBackup.trigger_type === 'auto'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {latestBackup.trigger_type}
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-600">No backups yet</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {backups.length} / {DEFAULT_BACKUP_CONFIG.maxBackups} retained
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBackupNow}
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Backing up...
                    </>
                  ) : (
                    <>
                      <Database className="w-3.5 h-3.5" />
                      Backup Now
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="text-sm font-medium text-slate-900 hover:text-indigo-600"
                >
                  View History &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <BackupHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        backups={backups}
        onRefresh={() => {
          fetchBackups();
        }}
      />
    </>
  );
}
