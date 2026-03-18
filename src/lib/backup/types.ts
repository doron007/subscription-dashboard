export interface BackupMetadata {
  id: string;
  created_at: string;
  trigger_type: 'auto' | 'manual';
  label: string;
  row_counts: Record<string, number>;
}

export interface BackupConfig {
  maxBackups: number;
  autoBackupIntervalDays: number;
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  maxBackups: 4,
  autoBackupIntervalDays: 7,
};

export interface ChangeLogEntry {
  table: string;
  action: 'added' | 'modified' | 'removed';
  sourceId: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  record?: Record<string, unknown>;
}

export interface ChangeLogSummary {
  backupId: string;
  backupDate: string;
  tables: {
    [tableName: string]: {
      added: number;
      modified: number;
      removed: number;
      details: ChangeLogEntry[];
    };
  };
  totalChanges: number;
}

/**
 * Maps source table names to their backup counterparts,
 * plus the fields to compare for modification detection.
 */
export const TABLE_CONFIG = {
  sub_vendors: {
    backupTable: 'sub_backup_vendors',
    compareFields: ['name', 'website', 'contact_email', 'logo_url', 'category'],
    displayName: 'Vendors',
  },
  sub_subscriptions: {
    backupTable: 'sub_backup_subscriptions',
    compareFields: ['name', 'category', 'cost', 'billing_cycle', 'status', 'seats_total', 'seats_used'],
    displayName: 'Subscriptions',
  },
  sub_invoices: {
    backupTable: 'sub_backup_invoices',
    compareFields: ['total_amount', 'invoice_date', 'status', 'invoice_number'],
    displayName: 'Invoices',
  },
  sub_invoice_line_items: {
    backupTable: 'sub_backup_line_items',
    compareFields: ['description', 'total_amount', 'quantity', 'unit_price'],
    displayName: 'Line Items',
  },
  sub_subscription_services: {
    backupTable: 'sub_backup_services',
    compareFields: ['name', 'category', 'status', 'current_quantity', 'current_unit_price'],
    displayName: 'Services',
  },
} as const;

export type SourceTableName = keyof typeof TABLE_CONFIG;
