const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'apex.db');
console.log(`Initializing database at ${dbPath}...`);

// If exists, delete for fresh start
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    store_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    timezone TEXT NOT NULL
  );

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
    confidence REAL NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    amount REAL NOT NULL,
    items INTEGER NOT NULL,
    visitor_id TEXT,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    is_staff INTEGER NOT NULL DEFAULT 0,
    has_purchase INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
  );
`);

// Create Indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_events_store_time ON events(store_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
  CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_store_time ON transactions(store_id, timestamp);
`);

// Seed stores
const insertStore = db.prepare('INSERT INTO stores (store_id, name, location, timezone) VALUES (?, ?, ?, ?)');

const stores = [
  ['STORE_BLR_001', 'Indiranagar Flagship', 'Bangalore', 'Asia/Kolkata'],
  ['STORE_BLR_002', 'Koramangala 100ft', 'Bangalore', 'Asia/Kolkata'],
  ['STORE_BLR_003', 'HSR Layout Sector 2', 'Bangalore', 'Asia/Kolkata'],
  ['STORE_BLR_004', 'Whitefield Forum', 'Bangalore', 'Asia/Kolkata'],
  ['STORE_BLR_005', 'Jayanagar 4th Block', 'Bangalore', 'Asia/Kolkata']
];

const insertMany = db.transaction((stores) => {
  for (const store of stores) insertStore.run(store);
});

insertMany(stores);

console.log('Database initialization complete!');
db.close();
