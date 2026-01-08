import { NextResponse } from 'next/server';
import { Transaction } from '@/types';

// Mock in-memory storage for now (would be DB in real app)
let transactions: Transaction[] = [
    {
        id: 'tx-1',
        subscriptionId: 'sub-1', // Assuming this matches some ID
        date: '2024-01-01',
        amount: 100,
        currency: 'USD',
        status: 'Posted',
        description: 'Monthly Subscription - Jan'
    },
    {
        id: 'tx-2',
        subscriptionId: 'sub-1',
        date: '2024-02-01',
        amount: 120, // Variation
        currency: 'USD',
        status: 'Posted',
        description: 'Monthly Subscription - Feb'
    }
];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get('subscriptionId');

    if (subscriptionId) {
        const filtered = transactions.filter(t => t.subscriptionId === subscriptionId);
        return NextResponse.json(filtered);
    }

    return NextResponse.json(transactions);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        // Validation would go here

        const newTransaction: Transaction = {
            id: `tx-${Date.now()}`,
            status: 'Posted',
            currency: 'USD',
            ...body
        };

        transactions.push(newTransaction);
        return NextResponse.json(newTransaction);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
    }
}
