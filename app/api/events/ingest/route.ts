// ============================================================
// POST /api/events/ingest — Event Ingestion with Idempotency
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { validateEvents } from '@/lib/validators';
import {
  insertEvent,
  eventExists,
  createSession,
  closeSession,
  getSessionByVisitor,
  updateSessionZones,
  isDatabaseAvailable,
} from '@/lib/db';
import type { StoreEvent, IngestResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const traceId = uuidv4();

  // Check database availability
  if (!isDatabaseAvailable()) {
    const logEntry = {
      trace_id: traceId,
      endpoint: '/api/events/ingest',
      method: 'POST',
      event_count: 0,
      inserted_count: 0,
      duplicate_count: 0,
      latency_ms: Date.now() - startTime,
      status_code: 503,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(
      { error: 'Service temporarily unavailable', retry_after: 30 },
      { status: 503 }
    );
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const logEntry = {
      trace_id: traceId,
      endpoint: '/api/events/ingest',
      method: 'POST',
      event_count: 0,
      inserted_count: 0,
      duplicate_count: 0,
      latency_ms: Date.now() - startTime,
      status_code: 400,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(
      { error: 'Malformed JSON body' },
      { status: 400 }
    );
  }

  // Handle empty array
  if (Array.isArray(body) && body.length === 0) {
    const response: IngestResponse = {
      success: true,
      inserted: 0,
      duplicates: 0,
      errors: [],
    };

    const logEntry = {
      trace_id: traceId,
      endpoint: '/api/events/ingest',
      method: 'POST',
      event_count: 0,
      inserted_count: 0,
      duplicate_count: 0,
      latency_ms: Date.now() - startTime,
      status_code: 200,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(response);
  }

  // Validate events
  const { valid, errors } = validateEvents(body);

  // Check batch size
  const inputEvents = Array.isArray(body) ? body : [body];
  if (inputEvents.length > 500) {
    return NextResponse.json(
      { error: 'Batch size exceeds maximum of 500 events' },
      { status: 400 }
    );
  }

  // If ALL events failed validation, return 400
  if (valid.length === 0 && errors.length > 0) {
    const logEntry = {
      trace_id: traceId,
      endpoint: '/api/events/ingest',
      method: 'POST',
      event_count: inputEvents.length,
      inserted_count: 0,
      duplicate_count: 0,
      latency_ms: Date.now() - startTime,
      status_code: 400,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));

    return NextResponse.json(
      {
        success: false,
        inserted: 0,
        duplicates: 0,
        errors,
      },
      { status: 400 }
    );
  }

  // Process valid events
  let insertedCount = 0;
  let duplicateCount = 0;

  for (const event of valid) {
    // Idempotency check
    if (eventExists(event.event_id)) {
      duplicateCount++;
      continue;
    }

    try {
      const inserted = insertEvent(event);
      if (inserted) {
        insertedCount++;
        // Handle session management
        handleSessionUpdate(event);
      } else {
        duplicateCount++;
      }
    } catch (err) {
      errors.push({
        event_id: event.event_id,
        reason: err instanceof Error ? err.message : 'Unknown insert error',
      });
    }
  }

  const response: IngestResponse = {
    success: true,
    inserted: insertedCount,
    duplicates: duplicateCount,
    errors,
  };

  const statusCode = errors.length > 0 && insertedCount > 0 ? 207 : 200;

  const logEntry = {
    trace_id: traceId,
    endpoint: '/api/events/ingest',
    method: 'POST',
    event_count: inputEvents.length,
    inserted_count: insertedCount,
    duplicate_count: duplicateCount,
    latency_ms: Date.now() - startTime,
    status_code: statusCode,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(logEntry));

  return NextResponse.json(response, { status: statusCode });
}

// --- Session Management ---
function handleSessionUpdate(event: StoreEvent): void {
  try {
    if (event.event_type === 'ENTRY' || event.event_type === 'REENTRY') {
      // Create new session
      const sessionId = `SES_${event.visitor_id}_${Date.now()}`;
      createSession({
        session_id: sessionId,
        visitor_id: event.visitor_id,
        store_id: event.store_id,
        entry_time: event.timestamp,
        exit_time: null,
        is_staff: event.is_staff,
        total_dwell_ms: 0,
        zones_visited: '[]',
      });
    } else if (event.event_type === 'EXIT') {
      // Close session
      closeSession(event.visitor_id, event.store_id, event.timestamp, event.dwell_ms);
    } else if (event.event_type === 'ZONE_ENTER') {
      // Update session zones
      const session = getSessionByVisitor(event.visitor_id, event.store_id);
      if (session) {
        const zones: string[] = JSON.parse(session.zones_visited || '[]');
        if (!zones.includes(event.zone_id)) {
          zones.push(event.zone_id);
          updateSessionZones(session.session_id, zones);
        }
      }
    }
  } catch (err) {
    console.error('Session update error:', err);
  }
}
