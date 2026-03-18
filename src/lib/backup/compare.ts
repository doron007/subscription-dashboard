import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ChangeLogEntry,
  ChangeLogSummary,
  TABLE_CONFIG,
  SourceTableName,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

function getServiceClient(): AnySupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function fetchAllRows(
  supabase: AnySupabaseClient,
  table: string
): Promise<Record<string, unknown>[]> {
  const PAGE_SIZE = 1000;
  let allRows: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows = allRows.concat(data as Record<string, unknown>[]);
      offset += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    }
  }

  return allRows;
}

/**
 * Compare a backup snapshot to the current live database state.
 * Returns a structured summary of all changes per table.
 */
export async function compareBackupToCurrent(
  backupId: string
): Promise<ChangeLogSummary> {
  const supabase = getServiceClient();

  // Verify backup exists
  const { data: meta, error: metaError } = await supabase
    .from('sub_backup_metadata')
    .select('*')
    .eq('id', backupId)
    .single();

  if (metaError || !meta) {
    throw new Error('Backup not found');
  }

  const summary: ChangeLogSummary = {
    backupId,
    backupDate: meta.created_at as string,
    tables: {},
    totalChanges: 0,
  };

  const tableNames = Object.keys(TABLE_CONFIG) as SourceTableName[];

  for (const sourceTable of tableNames) {
    const config = TABLE_CONFIG[sourceTable];
    const details: ChangeLogEntry[] = [];

    // Fetch backup rows for this backup
    const allBackupRows = await fetchAllRows(supabase, config.backupTable);
    const backupRows = allBackupRows.filter(
      (row) => row.backup_id === backupId
    );

    // Fetch current live rows
    const liveRows = await fetchAllRows(supabase, sourceTable);

    // Index by source_id (backup) and id (live)
    const backupMap = new Map<string, Record<string, unknown>>();
    for (const row of backupRows) {
      backupMap.set(row.source_id as string, row);
    }

    const liveMap = new Map<string, Record<string, unknown>>();
    for (const row of liveRows) {
      liveMap.set(row.id as string, row);
    }

    // Find added records (in live but not in backup)
    for (const [liveId, liveRow] of liveMap) {
      if (!backupMap.has(liveId)) {
        details.push({
          table: config.displayName,
          action: 'added',
          sourceId: liveId,
          record: sanitizeRow(liveRow),
        });
      }
    }

    // Find removed records (in backup but not in live)
    for (const [sourceId, backupRow] of backupMap) {
      if (!liveMap.has(sourceId)) {
        details.push({
          table: config.displayName,
          action: 'removed',
          sourceId,
          record: sanitizeRow(backupRow),
        });
      }
    }

    // Find modified records (in both, but with different values in compare fields)
    for (const [sourceId, backupRow] of backupMap) {
      const liveRow = liveMap.get(sourceId);
      if (!liveRow) continue;

      for (const field of config.compareFields) {
        const oldVal = backupRow[field];
        const newVal = liveRow[field];

        // Normalize for comparison (handle null vs undefined, numeric strings)
        if (normalize(oldVal) !== normalize(newVal)) {
          details.push({
            table: config.displayName,
            action: 'modified',
            sourceId,
            field,
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      }
    }

    const added = details.filter((d) => d.action === 'added').length;
    const modified = new Set(
      details.filter((d) => d.action === 'modified').map((d) => d.sourceId)
    ).size;
    const removed = details.filter((d) => d.action === 'removed').length;

    summary.tables[config.displayName] = {
      added,
      modified,
      removed,
      details,
    };

    summary.totalChanges += added + modified + removed;
  }

  return summary;
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return String(value);
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  // Strip backup-specific columns for display
  const { id: _id, backup_id: _bid, source_id: _sid, ...rest } = row;
  return rest;
}
