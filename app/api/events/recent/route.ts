// ============================================================
// GET /api/events/recent — Last 20 events from database
// ============================================================

import { NextResponse } from 'next/server';
import { getRecentEvents } from '@/lib/db';

export async function GET() {
  try {
    const events = getRecentEvents(20);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Failed to fetch recent events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent events' },
      { status: 500 }
    );
  }
}
