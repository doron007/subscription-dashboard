import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createBackup } from '@/lib/backup/backup';

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  try {
    const body = await request.json();
    const label = body?.label as string | undefined;

    const backup = await createBackup('manual', label);

    return NextResponse.json(backup);
  } catch (error) {
    console.error('Backup creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create backup', details: (error as Error).message },
      { status: 500 }
    );
  }
}
