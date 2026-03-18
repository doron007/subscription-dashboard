import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  BackupMetadata,
  DEFAULT_BACKUP_CONFIG,
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

/**
 * Fetch all rows from a table in pages (Supabase caps at 1000 per request).
 */
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
 * Insert rows into a backup table in batches.
 */
async function insertBackupRows(
  supabase: AnySupabaseClient,
  backupTable: string,
  backupId: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => {
      // Remove the original 'id' and map it to 'source_id'
      const { id, ...rest } = row;
      return {
        backup_id: backupId,
        source_id: id,
        ...rest,
      };
    });

    const { error } = await supabase.from(backupTable).insert(batch);
    if (error) {
      throw new Error(`Failed to insert into ${backupTable}: ${error.message}`);
    }
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Create a full backup of all sub_* tables.
 */
export async function createBackup(
  triggerType: 'auto' | 'manual',
  label?: string
): Promise<BackupMetadata> {
  const supabase = getServiceClient();

  // Create metadata row
  const { data: meta, error: metaError } = await supabase
    .from('sub_backup_metadata')
    .insert({
      trigger_type: triggerType,
      label: label || (triggerType === 'auto' ? 'Auto-backup before import' : 'Manual backup'),
      row_counts: {},
    })
    .select()
    .single();

  if (metaError || !meta) {
    throw new Error(`Failed to create backup metadata: ${metaError?.message}`);
  }

  const backupId = meta.id as string;
  const rowCounts: Record<string, number> = {};

  // Snapshot each table
  const tableNames = Object.keys(TABLE_CONFIG) as SourceTableName[];
  for (const sourceTable of tableNames) {
    const config = TABLE_CONFIG[sourceTable];
    const rows = await fetchAllRows(supabase, sourceTable);
    const count = await insertBackupRows(supabase, config.backupTable, backupId, rows);
    rowCounts[sourceTable] = count;
  }

  // Update metadata with row counts
  const { error: updateError } = await supabase
    .from('sub_backup_metadata')
    .update({ row_counts: rowCounts })
    .eq('id', backupId);

  if (updateError) {
    console.error('Failed to update backup row counts:', updateError.message);
  }

  // Prune old backups
  await pruneOldBackups(DEFAULT_BACKUP_CONFIG.maxBackups);

  return {
    id: backupId,
    created_at: meta.created_at as string,
    trigger_type: triggerType,
    label: label || (meta.label as string),
    row_counts: rowCounts,
  };
}

/**
 * List all backups, newest first.
 */
export async function getBackupHistory(): Promise<BackupMetadata[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('sub_backup_metadata')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch backup history: ${error.message}`);
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    created_at: row.created_at as string,
    trigger_type: row.trigger_type as 'auto' | 'manual',
    label: row.label as string,
    row_counts: (row.row_counts || {}) as Record<string, number>,
  }));
}

/**
 * Delete backups beyond the retention limit.
 */
export async function pruneOldBackups(
  maxBackups: number = DEFAULT_BACKUP_CONFIG.maxBackups
): Promise<number> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('sub_backup_metadata')
    .select('id')
    .order('created_at', { ascending: false });

  if (error || !data) return 0;

  if (data.length <= maxBackups) return 0;

  const toDelete = data.slice(maxBackups).map((row: Record<string, unknown>) => row.id as string);

  const { error: deleteError } = await supabase
    .from('sub_backup_metadata')
    .delete()
    .in('id', toDelete);

  if (deleteError) {
    console.error('Failed to prune old backups:', deleteError.message);
    return 0;
  }

  return toDelete.length;
}

/**
 * Ensure a recent backup exists. If the latest backup is older than
 * intervalDays, create a new auto-backup.
 */
export async function ensureRecentBackup(
  intervalDays: number = DEFAULT_BACKUP_CONFIG.autoBackupIntervalDays
): Promise<{ backed_up: boolean; backup_id: string | null }> {
  const supabase = getServiceClient();

  const { data } = await supabase
    .from('sub_backup_metadata')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  const latest = data?.[0] as Record<string, unknown> | undefined;

  if (latest) {
    const age = Date.now() - new Date(latest.created_at as string).getTime();
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    if (age < intervalMs) {
      return { backed_up: false, backup_id: null };
    }
  }

  // Need a new backup
  const backup = await createBackup('auto', 'Auto-backup before import');
  return { backed_up: true, backup_id: backup.id };
}

/**
 * Restore all sub_* tables from a given backup snapshot.
 * Creates a pre-restore safety backup first.
 */
export async function restoreFromBackup(
  backupId: string
): Promise<{ success: boolean; preRestoreBackupId: string }> {
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

  // Create a pre-restore safety backup
  const safetyBackup = await createBackup('auto', 'Pre-restore safety backup');

  // Delete order respects FK constraints (children first)
  const deleteOrder: SourceTableName[] = [
    'sub_invoice_line_items',
    'sub_subscription_services',
    'sub_invoices',
    'sub_subscriptions',
    'sub_vendors',
  ];

  // Insert order is the reverse (parents first)
  const insertOrder: SourceTableName[] = [
    'sub_vendors',
    'sub_subscriptions',
    'sub_invoices',
    'sub_invoice_line_items',
    'sub_subscription_services',
  ];

  // Step 1: Delete all live rows in FK-safe order
  for (const table of deleteOrder) {
    const { error } = await supabase.from(table).delete().gte('created_at', '1970-01-01');
    if (error) {
      throw new Error(`Failed to clear ${table}: ${error.message}`);
    }
  }

  // Step 2: Restore from backup in parent-first order
  for (const sourceTable of insertOrder) {
    const config = TABLE_CONFIG[sourceTable];
    const backupRows = await fetchAllRows(supabase, config.backupTable);

    // Filter to only this backup's rows
    const thisBackupRows = backupRows.filter(
      (row) => row.backup_id === backupId
    );

    if (thisBackupRows.length === 0) continue;

    // Map backup rows back to source table shape
    const BATCH_SIZE = 500;
    for (let i = 0; i < thisBackupRows.length; i += BATCH_SIZE) {
      const batch = thisBackupRows.slice(i, i + BATCH_SIZE).map((row) => {
        // Remove backup-specific columns, restore source_id as id
        const { id: _backupRowId, backup_id: _bid, source_id, ...rest } = row;
        return { id: source_id, ...rest };
      });

      const { error } = await supabase.from(sourceTable).insert(batch);
      if (error) {
        throw new Error(
          `Failed to restore ${sourceTable}: ${error.message}`
        );
      }
    }
  }

  return { success: true, preRestoreBackupId: safetyBackup.id };
}
