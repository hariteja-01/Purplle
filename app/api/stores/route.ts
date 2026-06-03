// ============================================================
// GET /api/stores — List all stores
// ============================================================

import { NextResponse } from 'next/server';
import { getAllStores } from '@/lib/db';

export async function GET() {
  try {
    const stores = getAllStores();
    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Failed to fetch stores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stores' },
      { status: 500 }
    );
  }
}
