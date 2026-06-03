// ============================================================
// Apex Retail Intelligence System — Canonical Type Definitions
// ============================================================

// --- Event Types ---

export const EVENT_TYPES = [
  'ENTRY',
  'EXIT',
  'ZONE_ENTER',
  'ZONE_EXIT',
  'ZONE_DWELL',
  'BILLING_QUEUE_JOIN',
  'BILLING_QUEUE_ABANDON',
  'REENTRY',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ZONE_IDS = [
  'ENTRY',
  'SKINCARE',
  'MOISTURISER',
  'MAKEUP',
  'FRAGRANCE',
  'BILLING',
] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export const CAMERA_IDS = [
  'CAM_ENTRY_01',
  'CAM_FLOOR_01',
  'CAM_BILLING_01',
] as const;
export type CameraId = (typeof CAMERA_IDS)[number];

export const BRAND_NAMES = [
  'Faces Canada',
  'Purplle',
  'Renee',
  'Lakme',
  'Maybelline',
] as const;
export type BrandName = (typeof BRAND_NAMES)[number];

export const STORE_IDS = [
  'STORE_BLR_001',
  'STORE_BLR_002',
  'STORE_BLR_003',
  'STORE_BLR_004',
  'STORE_BLR_005',
] as const;
export type StoreId = (typeof STORE_IDS)[number];

// --- Core Event Schema (exact match to problem statement) ---

export interface EventMetadata {
  queue_depth: number | null;
  sku_zone: string;
  session_seq: number;
}

export interface StoreEvent {
  event_id: string;           // uuid-v4
  store_id: string;           // STORE_BLR_002 format
  camera_id: CameraId;
  visitor_id: string;         // VIS_ + 6-char hex
  event_type: EventType;
  timestamp: string;          // ISO-8601 UTC "2026-03-03T14:22:10Z"
  zone_id: ZoneId;
  dwell_ms: number;           // 0 for instant events, >0 for dwell
  is_staff: boolean;
  confidence: number;         // 0.0 - 1.0
  metadata: EventMetadata;
}

// --- Database Models ---

export interface Session {
  session_id: string;
  visitor_id: string;
  store_id: string;
  entry_time: string;
  exit_time: string | null;
  is_staff: boolean;
  total_dwell_ms: number;
  zones_visited: string;      // JSON array of zone_ids
  converted: number;          // 0 or 1
}

export interface Transaction {
  transaction_id: string;
  store_id: string;
  timestamp: string;
  basket_value: number;
  order_id: string;           // integer as string
  product_id: string;         // 6-digit integer as string
  brand_name: BrandName;
}

// POS CSV format from problem statement
export interface POSRecord {
  order_id: number;
  order_date: string;         // DD-MM-YYYY
  order_time: string;         // HH:MM:SS
  store_id: string;
  product_id: number;         // 6-digit integer
  brand_name: BrandName;
  total_amount: number;       // float with 2 decimals
}

export interface Store {
  store_id: string;
  name: string;
  city: string;
  zones: string;              // JSON array
  cameras: string;            // JSON array
}

// --- API Response Types ---

export interface MetricsResponse {
  store_id: string;
  time_window: string;
  unique_visitors: number;
  conversion_rate: number;
  avg_dwell_per_zone: Record<string, number>;
  current_queue_depth: number;
  abandonment_rate: number;
  last_updated: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  drop_off_pct: number;
}

export interface FunnelResponse {
  store_id: string;
  funnel_stages: FunnelStage[];
  re_entry_count: number;
  group_entry_detected: number;
}

export interface HeatmapZone {
  zone_id: string;
  visit_count: number;
  avg_dwell_ms: number;
  normalized_score: number;   // 0-100
}

export interface HeatmapResponse {
  zones: HeatmapZone[];
  data_confidence: 'HIGH' | 'LOW';
}

export interface Anomaly {
  anomaly_id: string;
  type: 'QUEUE_SPIKE' | 'CONVERSION_DROP' | 'DEAD_ZONE';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  detected_at: string;
  affected_zone: string | null;
  current_value: number;
  expected_value: number;
  suggested_action: string;
}

export interface AnomalyResponse {
  anomalies: Anomaly[];
}

export interface StoreHealth {
  store_id: string;
  last_event_timestamp: string | null;
  status: 'ACTIVE' | 'STALE';
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  services: {
    database: 'up' | 'down';
    event_stream: 'active' | 'stale';
  };
  stores: StoreHealth[];
  uptime_seconds: number;
  version: string;
}

export interface IngestResponse {
  success: boolean;
  inserted: number;
  duplicates: number;
  errors: Array<{ event_id: string; reason: string }>;
}

export interface SimulationStatus {
  running: boolean;
  events_generated: number;
  current_visitors: number;
}
