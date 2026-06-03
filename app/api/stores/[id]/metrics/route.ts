// ============================================================
// GET /api/stores/[id]/metrics — Store Metrics
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getUniqueVisitorsToday,
  getConversionRate,
  getAvgDwellPerZone,
  getCurrentQueueDepth,
  getAbandonmentRate,
  getStore,
} from '@/lib/db';
import type { MetricsResponse } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const traceId = uuidv4();
  const { id: storeId } = await params;

  try {
    // Verify store exists
    const store = getStore(storeId);
    if (!store) {
      return NextResponse.json(
        { error: `Store ${storeId} not found` },
        { status: 404 }
      );
    }

    const uniqueVisitors = getUniqueVisitorsToday(storeId);
    const conversionRate = getConversionRate(storeId);
    const avgDwellPerZone = getAvgDwellPerZone(storeId);
    const currentQueueDepth = getCurrentQueueDepth(storeId);
    const abandonmentRate = getAbandonmentRate(storeId);

    const response: MetricsResponse = {
      store_id: storeId,
      time_window: 'today',
      unique_visitors: uniqueVisitors,
      conversion_rate: conversionRate,
      avg_dwell_per_zone: avgDwellPerZone,
      current_queue_depth: currentQueueDepth,
      abandonment_rate: abandonmentRate,
      last_updated: new Date().toISOString(),
    };

    const logEntry = {
      trace_id: traceId,
      endpoint: `/api/stores/${storeId}/metrics`,
      method: 'GET',
      latency_ms: Date.now() - startTime,
      status_code: 200,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Metrics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
