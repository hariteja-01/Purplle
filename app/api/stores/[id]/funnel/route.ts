// ============================================================
// GET /api/stores/[id]/funnel — Conversion Funnel
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFunnelData, getStore } from '@/lib/db';
import type { FunnelResponse, FunnelStage } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const traceId = uuidv4();
  const { id: storeId } = await params;

  try {
    const store = getStore(storeId);
    if (!store) {
      return NextResponse.json(
        { error: `Store ${storeId} not found` },
        { status: 404 }
      );
    }

    const data = getFunnelData(storeId);

    const funnelStages: FunnelStage[] = [
      {
        stage: 'Entry',
        count: data.entryCount,
        drop_off_pct: 0,
      },
      {
        stage: 'Zone Visit',
        count: data.zoneVisitCount,
        drop_off_pct:
          data.entryCount > 0
            ? Math.round(((data.entryCount - data.zoneVisitCount) / data.entryCount) * 10000) / 100
            : 0,
      },
      {
        stage: 'Billing Queue',
        count: data.billingQueueCount,
        drop_off_pct:
          data.zoneVisitCount > 0
            ? Math.round(((data.zoneVisitCount - data.billingQueueCount) / data.zoneVisitCount) * 10000) / 100
            : 0,
      },
      {
        stage: 'Purchase',
        count: data.purchaseCount,
        drop_off_pct:
          data.billingQueueCount > 0
            ? Math.round(((data.billingQueueCount - data.purchaseCount) / data.billingQueueCount) * 10000) / 100
            : 0,
      },
    ];

    const response: FunnelResponse = {
      store_id: storeId,
      funnel_stages: funnelStages,
      re_entry_count: data.reEntryCount,
      group_entry_detected: data.groupEntryDetected,
    };

    const logEntry = {
      trace_id: traceId,
      endpoint: `/api/stores/${storeId}/funnel`,
      method: 'GET',
      latency_ms: Date.now() - startTime,
      status_code: 200,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Funnel error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch funnel data' },
      { status: 500 }
    );
  }
}
