import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { Transaction } from '@/types';

/**
 * In-memory transaction storage.
 * Note: This is mock data for development. In production, transactions
 * would be stored in the database.
 */
const transactions: Transaction[] = [];

/**
 * GET /api/transactions
 * Returns transactions, optionally filtered by subscription ID.
 */
export async function GET(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get('subscriptionId');

    if (subscriptionId) {
        const filtered = transactions.filter(t => t.subscriptionId === subscriptionId);
        return NextResponse.json(filtered);
    }

    return NextResponse.json(transactions);
}

/**
 * POST /api/transactions
 * Creates a new transaction.
 */
export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();

        const newTransaction: Transaction = {
            id: `tx-${Date.now()}`,
            status: 'Posted',
            currency: 'USD',
            ...body
        };

        transactions.push(newTransaction);
        return NextResponse.json(newTransaction);
    } catch {
        return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
    }
}
