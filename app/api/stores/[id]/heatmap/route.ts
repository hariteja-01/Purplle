// ============================================================
// GET /api/stores/[id]/heatmap — Zone Heatmap
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getHeatmapData, getStore } from '@/lib/db';
import type { HeatmapResponse, HeatmapZone } from '@/lib/types';

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

    const data = getHeatmapData(storeId);

    // Calculate normalized scores (0-100)
    const maxVisits = Math.max(...data.zones.map((z) => z.visit_count), 1);

    const allZoneIds = ['SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE', 'BILLING'];
    const zoneMap = new Map(data.zones.map((z) => [z.zone_id, z]));

    const zones: HeatmapZone[] = allZoneIds.map((zoneId) => {
      const zoneData = zoneMap.get(zoneId);
      return {
        zone_id: zoneId,
        visit_count: zoneData?.visit_count ?? 0,
        avg_dwell_ms: Math.round(zoneData?.avg_dwell_ms ?? 0),
        normalized_score: zoneData
          ? Math.round((zoneData.visit_count / maxVisits) * 100)
          : 0,
      };
    });

    const response: HeatmapResponse = {
      zones,
      data_confidence: data.sessionCount > 20 ? 'HIGH' : 'LOW',
    };

    const logEntry = {
      trace_id: traceId,
      endpoint: `/api/stores/${storeId}/heatmap`,
      method: 'GET',
      latency_ms: Date.now() - startTime,
      status_code: 200,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Heatmap error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch heatmap data' },
      { status: 500 }
    );
  }
}
