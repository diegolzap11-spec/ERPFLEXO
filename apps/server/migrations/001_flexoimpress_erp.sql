CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  requires_color INTEGER NOT NULL DEFAULT 0,
  bag_type TEXT CHECK (bag_type IN ('ALTA', 'BAJA')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT,
  sku TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, color)
);

CREATE TABLE IF NOT EXISTS inventory (
  variant_id TEXT PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  minimum_stock INTEGER NOT NULL DEFAULT 50 CHECK (minimum_stock >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('PRODUCCION', 'DESPACHO')),
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  operator TEXT,
  bag_quantity INTEGER NOT NULL DEFAULT 0 CHECK (bag_quantity >= 0),
  operation_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  type TEXT NOT NULL CHECK (type IN ('ENTRADA', 'SALIDA')),
  reason TEXT NOT NULL CHECK (reason IN ('PRODUCCION', 'DESPACHO', 'CONSUMO_BOLSA')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
  stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory(stock);
CREATE INDEX IF NOT EXISTS idx_operations_kind_date ON operations(kind, operation_date);
CREATE INDEX IF NOT EXISTS idx_operations_variant ON operations(variant_id);
CREATE INDEX IF NOT EXISTS idx_movements_occurred ON movements(occurred_at);
CREATE INDEX IF NOT EXISTS idx_movements_variant ON movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_movements_operation ON movements(operation_id);

INSERT OR IGNORE INTO products (id, name, sku, requires_color, bag_type, sort_order) VALUES
  ('prod-casco-jockey', 'Casco Jockey', 'CJ', 1, 'ALTA', 1),
  ('prod-casco-minero', 'Casco Minero', 'CM', 1, 'ALTA', 2),
  ('prod-mascarilla-as', 'Mascarilla Tipo AS', 'MAS', 0, NULL, 3),
  ('prod-suspension', 'Suspensión', 'SUS', 0, NULL, 4),
  ('prod-aranas', 'Arañas', 'ARA', 0, 'BAJA', 5),
  ('prod-correas', 'Correas', 'COR', 0, 'BAJA', 6),
  ('prod-bolsa-alta', 'Bolsas de Alta', 'BAG-A', 0, NULL, 7),
  ('prod-bolsa-baja', 'Bolsas de Baja', 'BAG-B', 0, NULL, 8);

INSERT OR IGNORE INTO product_variants (id, product_id, color, sku, sort_order) VALUES
  ('var-cj-blanco', 'prod-casco-jockey', 'Blanco', 'CJ-BLA', 1),
  ('var-cj-amarillo', 'prod-casco-jockey', 'Amarillo', 'CJ-AMA', 2),
  ('var-cj-naranja', 'prod-casco-jockey', 'Naranja', 'CJ-NAR', 3),
  ('var-cj-celeste', 'prod-casco-jockey', 'Celeste', 'CJ-CEL', 4),
  ('var-cj-rojo', 'prod-casco-jockey', 'Rojo', 'CJ-ROJ', 5),
  ('var-cj-verde', 'prod-casco-jockey', 'Verde', 'CJ-VER', 6),
  ('var-cj-azul', 'prod-casco-jockey', 'Azul', 'CJ-AZU', 7),
  ('var-cj-plomo', 'prod-casco-jockey', 'Plomo', 'CJ-PLO', 8),
  ('var-cj-marron', 'prod-casco-jockey', 'Marrón', 'CJ-MAR', 9),
  ('var-cm-blanco', 'prod-casco-minero', 'Blanco', 'CM-BLA', 1),
  ('var-cm-amarillo', 'prod-casco-minero', 'Amarillo', 'CM-AMA', 2),
  ('var-cm-naranja', 'prod-casco-minero', 'Naranja', 'CM-NAR', 3),
  ('var-cm-celeste', 'prod-casco-minero', 'Celeste', 'CM-CEL', 4),
  ('var-cm-rojo', 'prod-casco-minero', 'Rojo', 'CM-ROJ', 5),
  ('var-cm-verde', 'prod-casco-minero', 'Verde', 'CM-VER', 6),
  ('var-cm-azul', 'prod-casco-minero', 'Azul', 'CM-AZU', 7),
  ('var-cm-plomo', 'prod-casco-minero', 'Plomo', 'CM-PLO', 8),
  ('var-cm-marron', 'prod-casco-minero', 'Marrón', 'CM-MAR', 9),
  ('var-mascarilla-as', 'prod-mascarilla-as', NULL, 'MAS-STD', 1),
  ('var-suspension', 'prod-suspension', NULL, 'SUS-STD', 1),
  ('var-aranas', 'prod-aranas', NULL, 'ARA-STD', 1),
  ('var-correas', 'prod-correas', NULL, 'COR-STD', 1),
  ('var-bolsa-alta', 'prod-bolsa-alta', NULL, 'BAG-A-STD', 1),
  ('var-bolsa-baja', 'prod-bolsa-baja', NULL, 'BAG-B-STD', 1);

INSERT OR IGNORE INTO inventory (variant_id, stock, minimum_stock)
SELECT id, 0, 50 FROM product_variants;
