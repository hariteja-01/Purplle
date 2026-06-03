// ============================================================
// Database Layer — better-sqlite3 with singleton pattern
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { StoreEvent, Session, Store } from './types';

// --- Singleton database connection ---
let _db: Database.Database | null = null;
const DB_PATH = process.env.VERCEL 
  ? path.join('/tmp', 'store-intelligence.db')
  : (process.env.DATABASE_URL?.replace('file:', '') || path.join(process.cwd(), 'data', 'store-intelligence.db'));

// Track server uptime
const SERVER_START_TIME = Date.now();

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - SERVER_START_TIME) / 1000);
}

export function getDb(): Database.Database {
  if (!_db) {
    // Ensure data directory exists
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initializeSchema(_db);
    seedStores(_db);
  }
  return _db;
}

export function isDatabaseAvailable(): boolean {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

// --- Schema initialization ---
function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      dwell_ms INTEGER NOT NULL DEFAULT 0,
      is_staff INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0.9,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT,
      is_staff INTEGER NOT NULL DEFAULT 0,
      total_dwell_ms INTEGER NOT NULL DEFAULT 0,
      zones_visited TEXT NOT NULL DEFAULT '[]',
      converted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      transaction_id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      basket_value REAL NOT NULL,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      brand_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stores (
      store_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      zones TEXT NOT NULL DEFAULT '[]',
      cameras TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_events_store_time ON events(store_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_store ON sessions(store_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_store_time ON transactions(store_id, timestamp);
  `);
}

// --- Seed store data ---
function seedStores(db: Database.Database): void {
  const stores: Store[] = [
    {
      store_id: 'STORE_BLR_001',
      name: 'Purplle Koramangala',
      city: 'Bangalore',
      zones: JSON.stringify(['ENTRY', 'SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE', 'BILLING']),
      cameras: JSON.stringify(['CAM_ENTRY_01', 'CAM_FLOOR_01', 'CAM_BILLING_01']),
    },
    {
      store_id: 'STORE_BLR_002',
      name: 'Purplle Indiranagar',
      city: 'Bangalore',
      zones: JSON.stringify(['ENTRY', 'SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE', 'BILLING']),
      cameras: JSON.stringify(['CAM_ENTRY_01', 'CAM_FLOOR_01', 'CAM_BILLING_01']),
    },
    {
      store_id: 'STORE_BLR_003',
      name: 'Purplle Whitefield',
      city: 'Bangalore',
      zones: JSON.stringify(['ENTRY', 'SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE', 'BILLING']),
      cameras: JSON.stringify(['CAM_ENTRY_01', 'CAM_FLOOR_01', 'CAM_BILLING_01']),
    },
    {
      store_id: 'STORE_BLR_004',
      name: 'Purplle Jayanagar',
      city: 'Bangalore',
      zones: JSON.stringify(['ENTRY', 'SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE', 'BILLING']),
      cameras: JSON.stringify(['CAM_ENTRY_01', 'CAM_FLOOR_01', 'CAM_BILLING_01']),
    },
    {
      store_id: 'STORE_BLR_005',
      name: 'Purplle MG Road',
      city: 'Bangalore',
      zones: JSON.stringify(['ENTRY', 'SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE', 'BILLING']),
      cameras: JSON.stringify(['CAM_ENTRY_01', 'CAM_FLOOR_01', 'CAM_BILLING_01']),
    },
  ];

  const insertStore = db.prepare(`
    INSERT OR IGNORE INTO stores (store_id, name, city, zones, cameras)
    VALUES (@store_id, @name, @city, @zones, @cameras)
  `);

  const insertMany = db.transaction((storeList: Store[]) => {
    for (const store of storeList) {
      insertStore.run(store);
    }
  });

  insertMany(stores);
}

// ============================================================
// Event Operations
// ============================================================

export function insertEvent(event: StoreEvent): boolean {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO events (event_id, store_id, camera_id, visitor_id, event_type, timestamp, zone_id, dwell_ms, is_staff, confidence, metadata)
      VALUES (@event_id, @store_id, @camera_id, @visitor_id, @event_type, @timestamp, @zone_id, @dwell_ms, @is_staff, @confidence, @metadata)
    `).run({
      ...event,
      is_staff: event.is_staff ? 1 : 0,
      metadata: JSON.stringify(event.metadata),
    });
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      return false; // Duplicate — idempotency
    }
    throw err;
  }
}

export function eventExists(eventId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId);
  return !!row;
}

export function getRecentEvents(limit: number = 20): StoreEvent[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM events ORDER BY created_at DESC, timestamp DESC LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  return rows.map(rowToEvent);
}

export function getEventsByStore(storeId: string, since?: string): StoreEvent[] {
  const db = getDb();
  if (since) {
    return (db.prepare(`
      SELECT * FROM events WHERE store_id = ? AND timestamp >= ? ORDER BY timestamp ASC
    `).all(storeId, since) as Array<Record<string, unknown>>).map(rowToEvent);
  }
  return (db.prepare(`
    SELECT * FROM events WHERE store_id = ? ORDER BY timestamp ASC
  `).all(storeId) as Array<Record<string, unknown>>).map(rowToEvent);
}

export function getLastEventTimestamp(storeId: string): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT MAX(timestamp) as last_ts FROM events WHERE store_id = ?
  `).get(storeId) as { last_ts: string | null } | undefined;
  return row?.last_ts ?? null;
}

export function getTotalEventCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number };
  return row.cnt;
}

// ============================================================
// Session Operations
// ============================================================

export function createSession(session: Omit<Session, 'converted'>): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO sessions (session_id, visitor_id, store_id, entry_time, exit_time, is_staff, total_dwell_ms, zones_visited, converted)
    VALUES (@session_id, @visitor_id, @store_id, @entry_time, @exit_time, @is_staff, @total_dwell_ms, @zones_visited, 0)
  `).run({
    ...session,
    is_staff: session.is_staff ? 1 : 0,
    exit_time: session.exit_time ?? null,
  });
}

export function closeSession(visitorId: string, storeId: string, exitTime: string, totalDwellMs: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET exit_time = ?, total_dwell_ms = ?
    WHERE visitor_id = ? AND store_id = ? AND exit_time IS NULL
  `).run(exitTime, totalDwellMs, visitorId, storeId);
}

export function updateSessionZones(sessionId: string, zones: string[]): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET zones_visited = ? WHERE session_id = ?
  `).run(JSON.stringify(zones), sessionId);
}

export function markSessionConverted(sessionId: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET converted = 1 WHERE session_id = ?').run(sessionId);
}

export function getSessionByVisitor(visitorId: string, storeId: string): Session | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM sessions WHERE visitor_id = ? AND store_id = ? AND exit_time IS NULL
    ORDER BY entry_time DESC LIMIT 1
  `).get(visitorId, storeId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToSession(row);
}

export function getActiveVisitorCount(storeId?: string): number {
  const db = getDb();
  if (storeId) {
    const row = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as cnt FROM sessions
      WHERE store_id = ? AND exit_time IS NULL AND is_staff = 0
    `).get(storeId) as { cnt: number };
    return row.cnt;
  }
  const row = db.prepare(`
    SELECT COUNT(DISTINCT visitor_id) as cnt FROM sessions
    WHERE exit_time IS NULL AND is_staff = 0
  `).get() as { cnt: number };
  return row.cnt;
}

// ============================================================
// Metrics Queries
// ============================================================

export function getUniqueVisitorsToday(storeId: string): number {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(`
    SELECT COUNT(DISTINCT visitor_id) as cnt FROM events
    WHERE store_id = ? AND is_staff = 0 AND date(timestamp) = ?
  `).get(storeId, today) as { cnt: number };
  return row.cnt;
}

export function getAvgDwellPerZone(storeId: string): Record<string, number> {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT zone_id, AVG(dwell_ms) as avg_dwell FROM events
    WHERE store_id = ? AND is_staff = 0 AND dwell_ms > 0
      AND event_type IN ('ZONE_DWELL', 'ZONE_EXIT')
      AND date(timestamp) = ?
      AND zone_id != 'ENTRY'
    GROUP BY zone_id
  `).all(storeId, today) as Array<{ zone_id: string; avg_dwell: number }>;

  const result: Record<string, number> = {
    SKINCARE: 0,
    MOISTURISER: 0,
    MAKEUP: 0,
    FRAGRANCE: 0,
    BILLING: 0,
  };
  for (const row of rows) {
    result[row.zone_id] = Math.round(row.avg_dwell);
  }
  return result;
}

export function getCurrentQueueDepth(storeId: string): number {
  const db = getDb();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const row = db.prepare(`
    SELECT COUNT(DISTINCT e.visitor_id) as cnt FROM events e
    WHERE e.store_id = ? AND e.zone_id = 'BILLING'
      AND e.event_type = 'BILLING_QUEUE_JOIN'
      AND e.timestamp >= ?
      AND e.visitor_id NOT IN (
        SELECT visitor_id FROM events
        WHERE store_id = ? AND timestamp >= ?
          AND event_type IN ('EXIT', 'BILLING_QUEUE_ABANDON')
      )
  `).get(storeId, twoMinAgo, storeId, twoMinAgo) as { cnt: number };
  return row.cnt;
}

export function getAbandonmentRate(storeId: string): number {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const joins = db.prepare(`
    SELECT COUNT(*) as cnt FROM events
    WHERE store_id = ? AND event_type = 'BILLING_QUEUE_JOIN' AND date(timestamp) = ?
  `).get(storeId, today) as { cnt: number };
  const abandons = db.prepare(`
    SELECT COUNT(*) as cnt FROM events
    WHERE store_id = ? AND event_type = 'BILLING_QUEUE_ABANDON' AND date(timestamp) = ?
  `).get(storeId, today) as { cnt: number };

  if (joins.cnt === 0) return 0;
  return Math.round((abandons.cnt / joins.cnt) * 10000) / 100;
}

export function getConversionRate(storeId: string): number {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const visitors = getUniqueVisitorsToday(storeId);
  if (visitors === 0) return 0;

  const converted = db.prepare(`
    SELECT COUNT(DISTINCT s.session_id) as cnt FROM sessions s
    WHERE s.store_id = ? AND s.converted = 1 AND s.is_staff = 0
      AND date(s.entry_time) = ?
  `).get(storeId, today) as { cnt: number };

  return Math.round((converted.cnt / visitors) * 10000) / 100;
}

// ============================================================
// Funnel Queries
// ============================================================

export function getFunnelData(storeId: string): {
  entryCount: number;
  zoneVisitCount: number;
  billingQueueCount: number;
  purchaseCount: number;
  reEntryCount: number;
  groupEntryDetected: number;
} {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Session-based counts (not raw events)
  const entryCount = (db.prepare(`
    SELECT COUNT(DISTINCT session_id) as cnt FROM sessions
    WHERE store_id = ? AND is_staff = 0 AND date(entry_time) = ?
  `).get(storeId, today) as { cnt: number }).cnt;

  const zoneVisitCount = (db.prepare(`
    SELECT COUNT(DISTINCT s.session_id) as cnt FROM sessions s
    INNER JOIN events e ON e.visitor_id = s.visitor_id AND e.store_id = s.store_id
    WHERE s.store_id = ? AND s.is_staff = 0 AND date(s.entry_time) = ?
      AND e.event_type = 'ZONE_ENTER' AND e.zone_id != 'ENTRY'
  `).get(storeId, today) as { cnt: number }).cnt;

  const billingQueueCount = (db.prepare(`
    SELECT COUNT(DISTINCT s.session_id) as cnt FROM sessions s
    INNER JOIN events e ON e.visitor_id = s.visitor_id AND e.store_id = s.store_id
    WHERE s.store_id = ? AND s.is_staff = 0 AND date(s.entry_time) = ?
      AND e.event_type = 'BILLING_QUEUE_JOIN'
  `).get(storeId, today) as { cnt: number }).cnt;

  const purchaseCount = (db.prepare(`
    SELECT COUNT(DISTINCT session_id) as cnt FROM sessions
    WHERE store_id = ? AND is_staff = 0 AND converted = 1 AND date(entry_time) = ?
  `).get(storeId, today) as { cnt: number }).cnt;

  // Re-entry count
  const reEntryCount = (db.prepare(`
    SELECT COUNT(*) as cnt FROM events
    WHERE store_id = ? AND event_type = 'REENTRY' AND date(timestamp) = ?
  `).get(storeId, today) as { cnt: number }).cnt;

  // Group entry: sessions with >1 ENTRY events within 5-second window
  const groupEntryDetected = (db.prepare(`
    SELECT COUNT(*) as cnt FROM (
      SELECT timestamp, COUNT(*) as grp_size FROM events
      WHERE store_id = ? AND event_type = 'ENTRY' AND date(timestamp) = ?
      GROUP BY CAST(strftime('%s', timestamp) AS INTEGER) / 5
      HAVING grp_size > 1
    )
  `).get(storeId, today) as { cnt: number }).cnt;

  return { entryCount, zoneVisitCount, billingQueueCount, purchaseCount, reEntryCount, groupEntryDetected };
}

// ============================================================
// Heatmap Queries
// ============================================================

export function getHeatmapData(storeId: string): {
  zones: Array<{ zone_id: string; visit_count: number; avg_dwell_ms: number }>;
  sessionCount: number;
} {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const zones = db.prepare(`
    SELECT zone_id,
           COUNT(DISTINCT visitor_id) as visit_count,
           COALESCE(AVG(CASE WHEN dwell_ms > 0 THEN dwell_ms END), 0) as avg_dwell_ms
    FROM events
    WHERE store_id = ? AND is_staff = 0 AND zone_id != 'ENTRY'
      AND event_type IN ('ZONE_ENTER', 'ZONE_DWELL', 'ZONE_EXIT')
      AND date(timestamp) = ?
    GROUP BY zone_id
  `).all(storeId, today) as Array<{ zone_id: string; visit_count: number; avg_dwell_ms: number }>;

  const sessionCount = (db.prepare(`
    SELECT COUNT(DISTINCT session_id) as cnt FROM sessions
    WHERE store_id = ? AND is_staff = 0 AND date(entry_time) = ?
  `).get(storeId, today) as { cnt: number }).cnt;

  return { zones, sessionCount };
}

// ============================================================
// Anomaly Detection Queries
// ============================================================

export function getQueueDepthStats(storeId: string): { avg: number; stddev: number } {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const row = db.prepare(`
    SELECT
      COALESCE(AVG(CAST(json_extract(metadata, '$.queue_depth') AS REAL)), 0) as avg_depth,
      COALESCE(
        SQRT(
          AVG(CAST(json_extract(metadata, '$.queue_depth') AS REAL) * CAST(json_extract(metadata, '$.queue_depth') AS REAL))
          - AVG(CAST(json_extract(metadata, '$.queue_depth') AS REAL)) * AVG(CAST(json_extract(metadata, '$.queue_depth') AS REAL))
        ), 1
      ) as stddev_depth
    FROM events
    WHERE store_id = ? AND event_type = 'BILLING_QUEUE_JOIN'
      AND timestamp >= ? AND json_extract(metadata, '$.queue_depth') IS NOT NULL
  `).get(storeId, sevenDaysAgo) as { avg_depth: number; stddev_depth: number };

  return { avg: row.avg_depth, stddev: row.stddev_depth || 1 };
}

export function getConversionRateHistory(storeId: string, days: number = 7): number {
  const db = getDb();
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const visitors = (db.prepare(`
    SELECT COUNT(DISTINCT visitor_id) as cnt FROM events
    WHERE store_id = ? AND is_staff = 0 AND date(timestamp) >= ? AND date(timestamp) < ?
  `).get(storeId, sinceDate, today) as { cnt: number }).cnt;

  if (visitors === 0) return 0;

  const converted = (db.prepare(`
    SELECT COUNT(DISTINCT session_id) as cnt FROM sessions
    WHERE store_id = ? AND converted = 1 AND is_staff = 0
      AND date(entry_time) >= ? AND date(entry_time) < ?
  `).get(storeId, sinceDate, today) as { cnt: number }).cnt;

  return (converted / visitors) * 100;
}

export function getDeadZones(storeId: string): string[] {
  const db = getDb();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const allZones = ['SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE', 'BILLING'];

  const activeZones = db.prepare(`
    SELECT DISTINCT zone_id FROM events
    WHERE store_id = ? AND event_type = 'ZONE_ENTER' AND timestamp >= ?
  `).all(storeId, thirtyMinAgo) as Array<{ zone_id: string }>;

  const activeSet = new Set(activeZones.map((r) => r.zone_id));
  return allZones.filter((z) => !activeSet.has(z));
}

// ============================================================
// Transaction Operations
// ============================================================

export function insertTransaction(txn: {
  transaction_id: string;
  store_id: string;
  timestamp: string;
  basket_value: number;
  order_id: string;
  product_id: string;
  brand_name: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO transactions (transaction_id, store_id, timestamp, basket_value, order_id, product_id, brand_name)
    VALUES (@transaction_id, @store_id, @timestamp, @basket_value, @order_id, @product_id, @brand_name)
  `).run(txn);
}

export function correlateTransactionToSession(
  storeId: string,
  transactionTimestamp: string
): string | null {
  const db = getDb();
  const fiveMinBefore = new Date(
    new Date(transactionTimestamp).getTime() - 5 * 60 * 1000
  ).toISOString();

  // Find session that had BILLING_QUEUE_JOIN within 5 min before transaction
  const row = db.prepare(`
    SELECT DISTINCT s.session_id FROM sessions s
    INNER JOIN events e ON e.visitor_id = s.visitor_id AND e.store_id = s.store_id
    WHERE s.store_id = ? AND s.is_staff = 0
      AND e.event_type IN ('BILLING_QUEUE_JOIN', 'ZONE_ENTER')
      AND e.zone_id = 'BILLING'
      AND e.timestamp >= ? AND e.timestamp <= ?
      AND s.converted = 0
    ORDER BY e.timestamp DESC LIMIT 1
  `).get(storeId, fiveMinBefore, transactionTimestamp) as { session_id: string } | undefined;

  if (row) {
    markSessionConverted(row.session_id);
    return row.session_id;
  }
  return null;
}

// ============================================================
// Store Operations
// ============================================================

export function getAllStores(): Store[] {
  const db = getDb();
  return db.prepare('SELECT * FROM stores').all() as Store[];
}

export function getStore(storeId: string): Store | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM stores WHERE store_id = ?').get(storeId) as Store) || null;
}

// ============================================================
// Reset (for testing / simulation reset)
// ============================================================

export function resetDatabase(): void {
  const db = getDb();
  db.exec('DELETE FROM events');
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM transactions');
}

// ============================================================
// Helpers
// ============================================================

function rowToEvent(row: Record<string, unknown>): StoreEvent {
  return {
    event_id: row.event_id as string,
    store_id: row.store_id as string,
    camera_id: row.camera_id as string as StoreEvent['camera_id'],
    visitor_id: row.visitor_id as string,
    event_type: row.event_type as string as StoreEvent['event_type'],
    timestamp: row.timestamp as string,
    zone_id: row.zone_id as string as StoreEvent['zone_id'],
    dwell_ms: row.dwell_ms as number,
    is_staff: (row.is_staff as number) === 1,
    confidence: row.confidence as number,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata as StoreEvent['metadata'],
  };
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    session_id: row.session_id as string,
    visitor_id: row.visitor_id as string,
    store_id: row.store_id as string,
    entry_time: row.entry_time as string,
    exit_time: (row.exit_time as string) || null,
    is_staff: (row.is_staff as number) === 1,
    total_dwell_ms: row.total_dwell_ms as number,
    zones_visited: row.zones_visited as string,
    converted: row.converted as number,
  };
}
