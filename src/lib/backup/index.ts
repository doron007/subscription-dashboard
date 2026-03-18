export { createBackup, getBackupHistory, pruneOldBackups, ensureRecentBackup, restoreFromBackup } from './backup';
export { compareBackupToCurrent } from './compare';
export type { BackupMetadata, BackupConfig, ChangeLogEntry, ChangeLogSummary } from './types';
export { DEFAULT_BACKUP_CONFIG, TABLE_CONFIG } from './types';
