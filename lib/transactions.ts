// ============================================================
// POS Transaction Correlation Module
// ============================================================

import type { POSRecord, BrandName } from './types';
import { BRAND_NAMES } from './types';

/**
 * Convert a transaction timestamp (ISO-8601) to POS CSV format
 */
export function toPOSRecord(transaction: {
  order_id: string;
  store_id: string;
  timestamp: string;
  basket_value: number;
  product_id: string;
  brand_name: string;
}): POSRecord {
  const date = new Date(transaction.timestamp);

  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const orderDate = `${dd}-${mm}-${yyyy}`;

  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const orderTime = `${hh}:${min}:${ss}`;

  return {
    order_id: parseInt(transaction.order_id, 10),
    order_date: orderDate,
    order_time: orderTime,
    store_id: transaction.store_id,
    product_id: parseInt(transaction.product_id, 10),
    brand_name: transaction.brand_name as BrandName,
    total_amount: Math.round(transaction.basket_value * 100) / 100,
  };
}

/**
 * Generate a random POS record for simulation
 */
export function generateRandomPOSRecord(storeId: string): POSRecord {
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = now.getUTCFullYear();

  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');

  return {
    order_id: Math.floor(100000 + Math.random() * 900000),
    order_date: `${dd}-${mm}-${yyyy}`,
    order_time: `${hh}:${min}:${ss}`,
    store_id: storeId,
    product_id: Math.floor(100000 + Math.random() * 900000),
    brand_name: BRAND_NAMES[Math.floor(Math.random() * BRAND_NAMES.length)],
    total_amount: Math.round((100 + Math.random() * 2900) * 100) / 100,
  };
}

/**
 * Format POS records as CSV
 */
export function posRecordsToCsv(records: POSRecord[]): string {
  const header = 'order_id,order_date,order_time,store_id,product_id,brand_name,total_amount';
  const rows = records.map(
    (r) =>
      `${r.order_id},${r.order_date},${r.order_time},${r.store_id},${r.product_id},${r.brand_name},${r.total_amount.toFixed(2)}`
  );
  return [header, ...rows].join('\n');
}
