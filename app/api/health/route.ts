// ============================================================
// GET /api/health — System Health Check
// ============================================================

import { NextResponse } from 'next/server';
import {
  isDatabaseAvailable,
  getAllStores,
  getLastEventTimestamp,
  getUptimeSeconds,
} from '@/lib/db';
import type { HealthResponse, StoreHealth } from '@/lib/types';

export async function GET() {
  try {
    const dbUp = isDatabaseAvailable();
    const uptimeSeconds = getUptimeSeconds();

    let stores: StoreHealth[] = [];
    let eventStreamStatus: 'active' | 'stale' = 'stale';

    if (dbUp) {
      const allStores = getAllStores();
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      stores = allStores.map((store) => {
        const lastEvent = getLastEventTimestamp(store.store_id);
        const isActive = lastEvent !== null && lastEvent > tenMinAgo;
        return {
          store_id: store.store_id,
          last_event_timestamp: lastEvent,
          status: isActive ? 'ACTIVE' as const : 'STALE' as const,
        };
      });

      // Event stream is active if any store has recent events
      eventStreamStatus = stores.some((s) => s.status === 'ACTIVE')
        ? 'active'
        : 'stale';
    }

    const overallStatus = dbUp ? 'healthy' : 'degraded';

    const response: HealthResponse = {
      status: overallStatus,
      services: {
        database: dbUp ? 'up' : 'down',
        event_stream: eventStreamStatus,
      },
      stores,
      uptime_seconds: uptimeSeconds,
      version: '1.0.0',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'degraded',
        services: { database: 'down', event_stream: 'stale' },
        stores: [],
        uptime_seconds: 0,
        version: '1.0.0',
      } as HealthResponse,
      { status: 500 }
    );
  }
}
