// ============================================================
// GET /api/simulation/status — Current Simulation Status
// ============================================================

import { NextResponse } from 'next/server';
import { getSimulationStatus } from '@/lib/simulation';
import type { SimulationStatus } from '@/lib/types';

export async function GET() {
  try {
    const status: SimulationStatus = getSimulationStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Simulation status error:', error);
    return NextResponse.json(
      { running: false, events_generated: 0, current_visitors: 0 } as SimulationStatus
    );
  }
}
