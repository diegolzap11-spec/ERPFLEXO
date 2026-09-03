CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  ruc TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  operation_date TEXT NOT NULL,
  operator TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_operations (
  operation_id TEXT PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE,
  dispatch_id TEXT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clients_ruc ON clients(ruc);
CREATE INDEX IF NOT EXISTS idx_dispatches_client ON dispatches(client_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON dispatches(operation_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_operations_dispatch ON dispatch_operations(dispatch_id);
