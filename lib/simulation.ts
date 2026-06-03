// ============================================================
// Live Detection Simulation Engine
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { StoreEvent, EventMetadata, BrandName } from './types';
import { STORE_IDS, ZONE_IDS, CAMERA_IDS, BRAND_NAMES } from './types';

// --- Simulation State (singleton) ---
let simulationRunning = false;
let eventsGenerated = 0;
let simulationTimer: ReturnType<typeof setTimeout> | null = null;

// Track active visitors per store
const activeVisitors: Map<string, Map<string, {
  visitor_id: string;
  zones_visited: string[];
  is_staff: boolean;
  entry_time: number;
  session_seq: number;
  in_billing: boolean;
}>> = new Map();

// Track exited visitors for re-entry
const exitedVisitors: Map<string, string[]> = new Map();

export function getSimulationStatus() {
  let totalVisitors = 0;
  activeVisitors.forEach((visitors) => {
    totalVisitors += visitors.size;
  });
  return {
    running: simulationRunning,
    events_generated: eventsGenerated,
    current_visitors: totalVisitors,
  };
}

export function startSimulation(baseUrl: string) {
  if (simulationRunning) return;
  simulationRunning = true;

  // Initialize active visitors map for each store
  for (const storeId of STORE_IDS) {
    if (!activeVisitors.has(storeId)) {
      activeVisitors.set(storeId, new Map());
    }
    if (!exitedVisitors.has(storeId)) {
      exitedVisitors.set(storeId, []);
    }
  }

  runSimulationLoop(baseUrl);
}

export function stopSimulation() {
  simulationRunning = false;
  if (simulationTimer) {
    clearTimeout(simulationTimer);
    simulationTimer = null;
  }
}

export function resetSimulation() {
  stopSimulation();
  eventsGenerated = 0;
  activeVisitors.clear();
  exitedVisitors.clear();
}

// --- Main Simulation Loop ---
async function runSimulationLoop(baseUrl: string) {
  if (!simulationRunning) return;

  try {
    // Process each store
    for (const storeId of STORE_IDS) {
      await simulateStoreActivity(storeId, baseUrl);
    }
  } catch (err) {
    console.error('Simulation error:', err);
  }

  // Schedule next tick: 2-5 seconds
  const delay = 2000 + Math.random() * 3000;
  simulationTimer = setTimeout(() => runSimulationLoop(baseUrl), delay);
}

// --- Per-Store Activity Simulation ---
async function simulateStoreActivity(storeId: string, baseUrl: string) {
  const visitors = activeVisitors.get(storeId) || new Map();
  const exited = exitedVisitors.get(storeId) || [];
  const events: StoreEvent[] = [];
  const now = new Date();

  // --- Empty Period Simulation (5% chance) ---
  if (Math.random() < 0.05) {
    return; // Skip this store for this tick (simulates empty period)
  }

  // --- New Visitor Entry (40% chance per tick) ---
  if (Math.random() < 0.4) {
    const isGroupEntry = Math.random() < 0.2; // 20% chance of group entry
    const groupSize = isGroupEntry ? 2 + Math.floor(Math.random() * 3) : 1; // 2-4 people

    for (let g = 0; g < groupSize; g++) {
      const isStaff = Math.random() < 0.15; // 15% staff
      const visitorId = generateVisitorId();

      // Check for re-entry (5% chance from exited visitors)
      let isReentry = false;
      let reentryVisitorId = visitorId;
      if (!isGroupEntry && exited.length > 0 && Math.random() < 0.05) {
        isReentry = true;
        reentryVisitorId = exited.splice(Math.floor(Math.random() * exited.length), 1)[0];
      }

      const vid = isReentry ? reentryVisitorId : visitorId;
      const entryTime = new Date(now.getTime() + g * (Math.random() * 2000)); // Within 2-sec window for groups
      const confidence = generateConfidence(groupSize > 1);

      const entryEvent = createEvent({
        store_id: storeId,
        visitor_id: vid,
        event_type: isReentry ? 'REENTRY' : 'ENTRY',
        timestamp: entryTime.toISOString(),
        zone_id: 'ENTRY',
        camera_id: 'CAM_ENTRY_01',
        dwell_ms: 0,
        is_staff: isStaff,
        confidence,
        metadata: { queue_depth: null, sku_zone: 'ENTRY', session_seq: 0 },
      });

      events.push(entryEvent);

      visitors.set(vid, {
        visitor_id: vid,
        zones_visited: ['ENTRY'],
        is_staff: isStaff,
        entry_time: entryTime.getTime(),
        session_seq: 1,
        in_billing: false,
      });
    }
  }

  // --- Process existing visitors ---
  const visitorIds = Array.from(visitors.keys());
  for (const vid of visitorIds) {
    const visitor = visitors.get(vid)!;
    const timeInStore = now.getTime() - visitor.entry_time;

    // Zone movement (30% chance per tick if in store > 5 seconds)
    if (timeInStore > 5000 && Math.random() < 0.3) {
      const shopZones = ['SKINCARE', 'MOISTURISER', 'MAKEUP', 'FRAGRANCE'] as const;
      const availableZones = shopZones.filter((z) => !visitor.zones_visited.includes(z));

      if (availableZones.length > 0) {
        const targetZone = availableZones[Math.floor(Math.random() * availableZones.length)];

        // ZONE_EXIT from current zone (if not ENTRY)
        const currentZone = visitor.zones_visited[visitor.zones_visited.length - 1];
        if (currentZone !== 'ENTRY') {
          const dwellMs = 5000 + Math.floor(Math.random() * 60000); // 5-65 seconds
          visitor.session_seq++;
          events.push(createEvent({
            store_id: storeId,
            visitor_id: vid,
            event_type: 'ZONE_EXIT',
            timestamp: now.toISOString(),
            zone_id: currentZone as StoreEvent['zone_id'],
            camera_id: 'CAM_FLOOR_01',
            dwell_ms: dwellMs,
            is_staff: visitor.is_staff,
            confidence: generateConfidence(false),
            metadata: { queue_depth: null, sku_zone: currentZone, session_seq: visitor.session_seq },
          }));
        }

        // Camera overlap simulation (10% chance) — same visitor detected by two cameras
        // Deduplication: only emit one ZONE_ENTER based on timestamp priority
        const hasOverlap = Math.random() < 0.1;
        if (hasOverlap) {
          // Log the overlap but only emit one event (camera priority: CAM_FLOOR_01)
          console.log(JSON.stringify({
            type: 'camera_overlap_detected',
            visitor_id: vid,
            zone: targetZone,
            cameras: ['CAM_ENTRY_01', 'CAM_FLOOR_01'],
            resolved_camera: 'CAM_FLOOR_01',
          }));
        }

        // ZONE_ENTER new zone
        visitor.session_seq++;
        visitor.zones_visited.push(targetZone);
        events.push(createEvent({
          store_id: storeId,
          visitor_id: vid,
          event_type: 'ZONE_ENTER',
          timestamp: now.toISOString(),
          zone_id: targetZone as StoreEvent['zone_id'],
          camera_id: 'CAM_FLOOR_01',
          dwell_ms: 0,
          is_staff: visitor.is_staff,
          confidence: generateConfidence(false),
          metadata: { queue_depth: null, sku_zone: targetZone, session_seq: visitor.session_seq },
        }));
      }
    }

    // ZONE_DWELL event (20% chance if in zone > 30 seconds)
    if (timeInStore > 30000 && Math.random() < 0.2) {
      const currentZone = visitor.zones_visited[visitor.zones_visited.length - 1];
      if (currentZone !== 'ENTRY') {
        visitor.session_seq++;
        events.push(createEvent({
          store_id: storeId,
          visitor_id: vid,
          event_type: 'ZONE_DWELL',
          timestamp: now.toISOString(),
          zone_id: currentZone as StoreEvent['zone_id'],
          camera_id: 'CAM_FLOOR_01',
          dwell_ms: 30000,
          is_staff: visitor.is_staff,
          confidence: generateConfidence(false),
          metadata: { queue_depth: null, sku_zone: currentZone, session_seq: visitor.session_seq },
        }));
      }
    }

    // Billing queue (25% of visitors, after visiting at least 2 zones)
    if (
      !visitor.in_billing &&
      visitor.zones_visited.length >= 3 &&
      timeInStore > 15000 &&
      Math.random() < 0.25
    ) {
      visitor.in_billing = true;
      visitor.zones_visited.push('BILLING');
      visitor.session_seq++;

      const queueDepth = Array.from(visitors.values()).filter((v) => v.in_billing).length;

      events.push(createEvent({
        store_id: storeId,
        visitor_id: vid,
        event_type: 'BILLING_QUEUE_JOIN',
        timestamp: now.toISOString(),
        zone_id: 'BILLING',
        camera_id: 'CAM_BILLING_01',
        dwell_ms: 0,
        is_staff: visitor.is_staff,
        confidence: generateConfidence(false),
        metadata: { queue_depth: queueDepth, sku_zone: 'BILLING', session_seq: visitor.session_seq },
      }));
    }

    // Billing queue abandon (15% of billing visitors)
    if (visitor.in_billing && Math.random() < 0.03) { // ~15% over several ticks
      visitor.session_seq++;
      events.push(createEvent({
        store_id: storeId,
        visitor_id: vid,
        event_type: 'BILLING_QUEUE_ABANDON',
        timestamp: now.toISOString(),
        zone_id: 'BILLING',
        camera_id: 'CAM_BILLING_01',
        dwell_ms: 30000 + Math.floor(Math.random() * 60000),
        is_staff: visitor.is_staff,
        confidence: generateConfidence(false),
        metadata: { queue_depth: null, sku_zone: 'BILLING', session_seq: visitor.session_seq },
      }));

      // Exit after abandoning
      visitor.session_seq++;
      events.push(createEvent({
        store_id: storeId,
        visitor_id: vid,
        event_type: 'EXIT',
        timestamp: new Date(now.getTime() + 5000).toISOString(),
        zone_id: 'ENTRY',
        camera_id: 'CAM_ENTRY_01',
        dwell_ms: now.getTime() - visitor.entry_time,
        is_staff: visitor.is_staff,
        confidence: generateConfidence(false),
        metadata: { queue_depth: null, sku_zone: 'ENTRY', session_seq: visitor.session_seq },
      }));

      exited.push(vid);
      visitors.delete(vid);
      continue;
    }

    // Purchase + Exit (billing visitors after some time, 85% of billing)
    if (visitor.in_billing && timeInStore > 30000 && Math.random() < 0.15) {
      // Generate POS transaction for 85% of completing billing visitors
      if (Math.random() < 0.85 && !visitor.is_staff) {
        const transaction = generateTransaction(storeId, now);
        try {
          await postToApi(baseUrl, '/api/events/ingest', [createEvent({
            store_id: storeId,
            visitor_id: vid,
            event_type: 'ZONE_EXIT',
            timestamp: now.toISOString(),
            zone_id: 'BILLING',
            camera_id: 'CAM_BILLING_01',
            dwell_ms: 30000 + Math.floor(Math.random() * 60000),
            is_staff: visitor.is_staff,
            confidence: generateConfidence(false),
            metadata: { queue_depth: null, sku_zone: 'BILLING', session_seq: ++visitor.session_seq },
          })]);
          // Post transaction via internal import
          const { insertTransaction, correlateTransactionToSession } = require('./db');
          insertTransaction(transaction);
          correlateTransactionToSession(storeId, transaction.timestamp);
        } catch (err) {
          console.error('Transaction post error:', err);
        }
      }

      // Exit
      visitor.session_seq++;
      events.push(createEvent({
        store_id: storeId,
        visitor_id: vid,
        event_type: 'EXIT',
        timestamp: new Date(now.getTime() + 10000).toISOString(),
        zone_id: 'ENTRY',
        camera_id: 'CAM_ENTRY_01',
        dwell_ms: now.getTime() - visitor.entry_time,
        is_staff: visitor.is_staff,
        confidence: generateConfidence(false),
        metadata: { queue_depth: null, sku_zone: 'ENTRY', session_seq: visitor.session_seq },
      }));

      exited.push(vid);
      visitors.delete(vid);
      continue;
    }

    // Random exit (visitors who've been in store a while)
    if (timeInStore > 60000 && Math.random() < 0.1) {
      visitor.session_seq++;
      events.push(createEvent({
        store_id: storeId,
        visitor_id: vid,
        event_type: 'EXIT',
        timestamp: now.toISOString(),
        zone_id: 'ENTRY',
        camera_id: 'CAM_ENTRY_01',
        dwell_ms: now.getTime() - visitor.entry_time,
        is_staff: visitor.is_staff,
        confidence: generateConfidence(false),
        metadata: { queue_depth: null, sku_zone: 'ENTRY', session_seq: visitor.session_seq },
      }));

      exited.push(vid);
      visitors.delete(vid);
    }
  }

  activeVisitors.set(storeId, visitors);
  exitedVisitors.set(storeId, exited);

  // Post events batch to ingestion API
  if (events.length > 0) {
    try {
      await postToApi(baseUrl, '/api/events/ingest', events);
      eventsGenerated += events.length;
    } catch (err) {
      console.error(`Failed to post ${events.length} events for ${storeId}:`, err);
    }
  }
}

// ============================================================
// Helper Functions
// ============================================================

function generateVisitorId(): string {
  const hex = Math.random().toString(16).substring(2, 8).padEnd(6, '0');
  return `VIS_${hex}`;
}

function generateConfidence(isCrowded: boolean): number {
  // Partial occlusion: 10% chance of lower confidence
  if (Math.random() < 0.1) {
    return 0.65 + Math.random() * 0.1; // 0.65-0.75
  }
  if (isCrowded) {
    return 0.75 + Math.random() * 0.15; // 0.75-0.90
  }
  return 0.80 + Math.random() * 0.18; // 0.80-0.98
}

function createEvent(params: {
  store_id: string;
  visitor_id: string;
  event_type: StoreEvent['event_type'];
  timestamp: string;
  zone_id: StoreEvent['zone_id'];
  camera_id: StoreEvent['camera_id'];
  dwell_ms: number;
  is_staff: boolean;
  confidence: number;
  metadata: EventMetadata;
}): StoreEvent {
  return {
    event_id: uuidv4(),
    ...params,
  };
}

function generateTransaction(storeId: string, timestamp: Date) {
  const brands = BRAND_NAMES;
  const brand = brands[Math.floor(Math.random() * brands.length)];
  const amount = Math.round((100 + Math.random() * 2900) * 100) / 100; // 100-3000
  const orderId = Math.floor(100000 + Math.random() * 900000);
  const productId = Math.floor(100000 + Math.random() * 900000);

  return {
    transaction_id: uuidv4(),
    store_id: storeId,
    timestamp: timestamp.toISOString(),
    basket_value: amount,
    order_id: String(orderId),
    product_id: String(productId),
    brand_name: brand,
  };
}

async function postToApi(baseUrl: string, path: string, events: StoreEvent[]) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`API ${path} returned ${response.status}: ${text}`);
    }
  } catch (err) {
    console.error(`Failed to POST to ${path}:`, err);
  }
}
