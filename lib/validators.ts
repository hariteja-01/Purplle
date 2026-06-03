// ============================================================
// Zod Validators for Event Ingestion & API Payloads
// ============================================================

import { z } from 'zod';
import { EVENT_TYPES, ZONE_IDS, CAMERA_IDS } from './types';

// --- Event Metadata Schema ---
const EventMetadataSchema = z.object({
  queue_depth: z.number().int().nullable(),
  sku_zone: z.string(),
  session_seq: z.number().int().min(0),
});

// --- Store Event Schema (exact match to problem statement) ---
export const StoreEventSchema = z.object({
  event_id: z.string().uuid('event_id must be a valid UUID v4'),
  store_id: z.string().regex(
    /^STORE_[A-Z]{3}_\d{3}$/,
    'store_id must match STORE_BLR_002 format'
  ),
  camera_id: z.enum(CAMERA_IDS),
  visitor_id: z.string().regex(
    /^VIS_[0-9a-fA-F]{6}$/,
    'visitor_id must match VIS_ + 6 hex chars format'
  ),
  event_type: z.enum(EVENT_TYPES),
  timestamp: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    'timestamp must be valid ISO-8601 format'
  ),
  zone_id: z.enum(ZONE_IDS),
  dwell_ms: z.number().int().min(0),
  is_staff: z.boolean(),
  confidence: z.number().min(0).max(1),
  metadata: EventMetadataSchema,
});

// --- Batch Ingestion: single event or array up to 500 ---
export const IngestPayloadSchema = z.union([
  StoreEventSchema,
  z.array(StoreEventSchema).min(0).max(500),
]);

// --- Simulation Control Schema ---
export const SimulationControlSchema = z.object({
  action: z.enum(['start', 'stop', 'reset']),
});

// --- Validation helper ---
export function validateEvents(body: unknown): {
  valid: import('./types').StoreEvent[];
  errors: Array<{ event_id: string; reason: string }>;
} {
  const valid: import('./types').StoreEvent[] = [];
  const errors: Array<{ event_id: string; reason: string }> = [];

  // Normalize to array
  const events = Array.isArray(body) ? body : [body];

  for (const event of events) {
    const result = StoreEventSchema.safeParse(event);
    if (result.success) {
      valid.push(result.data as import('./types').StoreEvent);
    } else {
      const eventId =
        typeof event === 'object' && event !== null && 'event_id' in event
          ? String((event as Record<string, unknown>).event_id)
          : 'unknown';
      const reason = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      errors.push({ event_id: eventId, reason });
    }
  }

  return { valid, errors };
}
