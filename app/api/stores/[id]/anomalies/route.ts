// ============================================================
// GET /api/stores/[id]/anomalies — Anomaly Detection
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getStore,
  getCurrentQueueDepth,
  getQueueDepthStats,
  getConversionRate,
  getConversionRateHistory,
  getDeadZones,
} from '@/lib/db';
import type { Anomaly, AnomalyResponse } from '@/lib/types';

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

    const anomalies: Anomaly[] = [];
    const now = new Date().toISOString();

    // 1. QUEUE_SPIKE detection
    const currentQueueDepth = getCurrentQueueDepth(storeId);
    const queueStats = getQueueDepthStats(storeId);
    const queueThreshold = queueStats.avg + 2 * queueStats.stddev;

    if (currentQueueDepth > queueThreshold && currentQueueDepth > 0) {
      const severity =
        currentQueueDepth > queueStats.avg + 3 * queueStats.stddev
          ? 'CRITICAL'
          : currentQueueDepth > queueThreshold
            ? 'WARN'
            : 'INFO';

      anomalies.push({
        anomaly_id: uuidv4(),
        type: 'QUEUE_SPIKE',
        severity,
        detected_at: now,
        affected_zone: 'BILLING',
        current_value: currentQueueDepth,
        expected_value: Math.round(queueStats.avg * 100) / 100,
        suggested_action: 'Assign additional billing staff',
      });
    }

    // 2. CONVERSION_DROP detection
    const todayConversion = getConversionRate(storeId);
    const historicalConversion = getConversionRateHistory(storeId, 7);

    if (
      historicalConversion > 0 &&
      todayConversion < historicalConversion - 15
    ) {
      const severity =
        todayConversion < historicalConversion - 30
          ? 'CRITICAL'
          : todayConversion < historicalConversion - 20
            ? 'WARN'
            : 'INFO';

      anomalies.push({
        anomaly_id: uuidv4(),
        type: 'CONVERSION_DROP',
        severity,
        detected_at: now,
        affected_zone: null,
        current_value: Math.round(todayConversion * 100) / 100,
        expected_value: Math.round(historicalConversion * 100) / 100,
        suggested_action: 'Review product placement and staff engagement',
      });
    }

    // 3. DEAD_ZONE detection
    const deadZones = getDeadZones(storeId);
    for (const zone of deadZones) {
      anomalies.push({
        anomaly_id: uuidv4(),
        type: 'DEAD_ZONE',
        severity: 'WARN',
        detected_at: now,
        affected_zone: zone,
        current_value: 0,
        expected_value: 1, // At least 1 visit expected
        suggested_action: `Check camera connectivity for ${zone}`,
      });
    }

    const response: AnomalyResponse = { anomalies };

    const logEntry = {
      trace_id: traceId,
      endpoint: `/api/stores/${storeId}/anomalies`,
      method: 'GET',
      anomalies_detected: anomalies.length,
      latency_ms: Date.now() - startTime,
      status_code: 200,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Anomaly detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect anomalies' },
      { status: 500 }
    );
  }
}
