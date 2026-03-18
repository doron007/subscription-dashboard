import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { compareBackupToCurrent } from '@/lib/backup/compare';

export async function POST(request: Request) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    const body = await request.json();
    const { backupId } = body;

    if (!backupId || typeof backupId !== 'string') {
      return NextResponse.json(
        { error: 'backupId is required' },
        { status: 400 }
      );
    }

    const summary = await compareBackupToCurrent(backupId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Backup comparison failed:', error);
    return NextResponse.json(
      { error: 'Failed to compare backup', details: (error as Error).message },
      { status: 500 }
    );
  }
}
