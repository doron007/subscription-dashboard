import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { restoreFromBackup } from '@/lib/backup/backup';

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  try {
    const body = await request.json();
    const { backupId, confirm } = body;

    if (!backupId || typeof backupId !== 'string') {
      return NextResponse.json(
        { error: 'backupId is required' },
        { status: 400 }
      );
    }

    if (confirm !== true) {
      return NextResponse.json(
        { error: 'Confirmation required. Set confirm: true to proceed.' },
        { status: 400 }
      );
    }

    const result = await restoreFromBackup(backupId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Backup restore failed:', error);
    return NextResponse.json(
      { error: 'Failed to restore backup', details: (error as Error).message },
      { status: 500 }
    );
  }
}
