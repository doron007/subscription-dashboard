import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getBackupHistory } from '@/lib/backup/backup';

export async function GET() {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    const backups = await getBackupHistory();
    return NextResponse.json(backups);
  } catch (error) {
    console.error('Failed to list backups:', error);
    return NextResponse.json(
      { error: 'Failed to list backups', details: (error as Error).message },
      { status: 500 }
    );
  }
}
