import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  role: text("role").default("user"),
  username: text("username").unique(),
  displayUsername: text("displayUsername")
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
});

export const todos = sqliteTable(
  "todos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_todos_userId").on(table.userId)]
);

export const storageFiles = sqliteTable(
  "storage_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId"),
    gatewayFileId: text("gatewayFileId"),
    fileName: text("fileName").notNull(),
    fileSuffix: text("fileSuffix").notNull(),
    contentType: text("contentType").notNull().default("application/octet-stream"),
    fileSize: integer("fileSize").notNull(),
    objectKey: text("objectKey").notNull(),
    path: text("path").notNull(),
    downloadUrl: text("downloadUrl").notNull(),
    status: text("status", { enum: ["pending", "uploaded", "failed", "deleted"] }).notNull().default("pending"),
    errorMessage: text("errorMessage"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_storage_files_userId").on(table.userId),
    index("idx_storage_files_objectKey").on(table.objectKey),
    index("idx_storage_files_status").on(table.status)
  ]
);

/* @section: erp-data-model */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    requiresColor: integer("requires_color", { mode: "boolean" }).notNull().default(false),
    bagType: text("bag_type", { enum: ["ALTA", "BAJA"] }),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [uniqueIndex("ux_products_name").on(table.name), uniqueIndex("ux_products_sku").on(table.sku)]
);

export const productVariants = sqliteTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    color: text("color"),
    sku: text("sku").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_variants_product").on(table.productId),
    uniqueIndex("ux_variants_sku").on(table.sku),
    uniqueIndex("ux_variants_product_color").on(table.productId, table.color)
  ]
);

export const inventory = sqliteTable(
  "inventory",
  {
    variantId: text("variant_id")
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    stock: integer("stock").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(50),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_inventory_stock").on(table.stock)]
);

export const operations = sqliteTable(
  "operations",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["PRODUCCION", "DESPACHO"] }).notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    quantity: integer("quantity").notNull(),
    operator: text("operator"),
    bagQuantity: integer("bag_quantity").notNull().default(0),
    operationDate: text("operation_date").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_operations_kind_date").on(table.kind, table.operationDate),
    index("idx_operations_variant").on(table.variantId)
  ]
);

export const movements = sqliteTable(
  "movements",
  {
    id: text("id").primaryKey(),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    type: text("type", { enum: ["ENTRADA", "SALIDA"] }).notNull(),
    reason: text("reason", { enum: ["PRODUCCION", "DESPACHO", "CONSUMO_BOLSA"] }).notNull(),
    quantity: integer("quantity").notNull(),
    stockBefore: integer("stock_before").notNull(),
    stockAfter: integer("stock_after").notNull(),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_movements_occurred").on(table.occurredAt),
    index("idx_movements_variant").on(table.variantId),
    index("idx_movements_operation").on(table.operationId)
  ]
);

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type StorageFile = typeof storageFiles.$inferSelect;
export type NewStorageFile = typeof storageFiles.$inferInsert;
