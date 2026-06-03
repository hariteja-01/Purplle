// ============================================================
// POST /api/simulation/control — Start/Stop/Reset Simulation
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { SimulationControlSchema } from '@/lib/validators';
import { startSimulation, stopSimulation, resetSimulation } from '@/lib/simulation';
import { resetDatabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = SimulationControlSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid action. Use "start", "stop", or "reset".' },
        { status: 400 }
      );
    }

    const { action } = result.data;

    // Determine base URL from request
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    switch (action) {
      case 'start':
        startSimulation(baseUrl);
        return NextResponse.json({ message: 'Simulation started', status: 'running' });

      case 'stop':
        stopSimulation();
        return NextResponse.json({ message: 'Simulation stopped', status: 'stopped' });

      case 'reset':
        resetSimulation();
        resetDatabase();
        return NextResponse.json({ message: 'Simulation and database reset', status: 'reset' });

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Simulation control error:', error);
    return NextResponse.json(
      { error: 'Failed to control simulation' },
      { status: 500 }
    );
  }
}
