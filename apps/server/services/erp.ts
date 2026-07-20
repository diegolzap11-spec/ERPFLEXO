import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../_core/db";
import { inventory, movements, operations, products, productVariants } from "../db/schema";

export type OperationKind = "PRODUCCION" | "DESPACHO";

export type OperationInput = {
  kind: OperationKind;
  productId: string;
  variantId: string;
  quantity: number;
  operator?: string;
  bagQuantity: number;
  operationDate: string;
  notes?: string;
};

export class ErpBusinessError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INSUFFICIENT_STOCK",
    message: string,
    readonly status: 400 | 404 | 409
  ) {
    super(message);
    this.name = "ErpBusinessError";
  }
}

function mapInventoryRow(row: {
  productId: string;
  productName: string;
  productSku: string;
  requiresColor: boolean;
  bagType: "ALTA" | "BAJA" | null;
  productSort: number;
  variantId: string;
  color: string | null;
  variantSku: string;
  variantSort: number;
  stock: number;
  minimumStock: number;
  updatedAt: string;
}) {
  return {
    id: row.variantId,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    requiresColor: row.requiresColor,
    bagType: row.bagType,
    color: row.color,
    sku: row.variantSku,
    stock: row.stock,
    minimumStock: row.minimumStock,
    updatedAt: row.updatedAt,
    productSort: row.productSort,
    variantSort: row.variantSort
  };
}

/* @section: erp-snapshot */
export async function getErpSnapshot(date: string) {
  const db = getDb();
  const inventoryRows = await db
    .select({
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      requiresColor: products.requiresColor,
      bagType: products.bagType,
      productSort: products.sortOrder,
      variantId: productVariants.id,
      color: productVariants.color,
      variantSku: productVariants.sku,
      variantSort: productVariants.sortOrder,
      stock: inventory.stock,
      minimumStock: inventory.minimumStock,
      updatedAt: inventory.updatedAt
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(products.active, true), eq(productVariants.active, true)))
    .orderBy(asc(products.sortOrder), asc(productVariants.sortOrder));

  const recentMovements = await db
    .select({
      id: movements.id,
      operationId: movements.operationId,
      variantId: movements.variantId,
      type: movements.type,
      reason: movements.reason,
      quantity: movements.quantity,
      stockBefore: movements.stockBefore,
      stockAfter: movements.stockAfter,
      occurredAt: movements.occurredAt,
      productName: products.name,
      color: productVariants.color,
      operator: operations.operator,
      notes: operations.notes
    })
    .from(movements)
    .innerJoin(productVariants, eq(productVariants.id, movements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(operations, eq(operations.id, movements.operationId))
    .orderBy(desc(movements.occurredAt))
    .limit(200);

  const dayTotals = await db
    .select({
      kind: operations.kind,
      total: sql<number>`coalesce(sum(${operations.quantity}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number)
    })
    .from(operations)
    .where(eq(operations.operationDate, date))
    .groupBy(operations.kind);

  /* @section: operator-production-analytics */
  const registeredOperatorRows = await db
    .selectDistinct({ name: operations.operator })
    .from(operations)
    .where(eq(operations.kind, "PRODUCCION"));

  const productionRows = await db
    .select({
      id: operations.id,
      operator: operations.operator,
      quantity: operations.quantity,
      createdAt: operations.createdAt,
      productName: products.name,
      color: productVariants.color
    })
    .from(operations)
    .innerJoin(products, eq(products.id, operations.productId))
    .innerJoin(productVariants, eq(productVariants.id, operations.variantId))
    .where(and(eq(operations.kind, "PRODUCCION"), eq(operations.operationDate, date)))
    .orderBy(desc(operations.createdAt));

  const operatorMap = new Map<string, {
    name: string;
    units: number;
    records: number;
    productKeys: Set<string>;
    lastProductionAt: string;
    production: Array<{ id: string; productName: string; color: string | null; quantity: number; occurredAt: string }>;
  }>();

  for (const row of productionRows) {
    const name = row.operator?.trim();
    if (!name) continue;
    const normalizedName = name.toLocaleLowerCase("es");
    const current = operatorMap.get(normalizedName) ?? {
      name,
      units: 0,
      records: 0,
      productKeys: new Set<string>(),
      lastProductionAt: row.createdAt,
      production: []
    };
    current.units += row.quantity;
    current.records += 1;
    current.productKeys.add(`${row.productName}:${row.color ?? ""}`);
    current.production.push({
      id: row.id,
      productName: row.productName,
      color: row.color,
      quantity: row.quantity,
      occurredAt: row.createdAt
    });
    operatorMap.set(normalizedName, current);
  }

  const operatorUnits = Array.from(operatorMap.values()).reduce((sumValue, item) => sumValue + item.units, 0);
  const operators = Array.from(operatorMap.values())
    .map((item) => ({
      name: item.name,
      units: item.units,
      records: item.records,
      products: item.productKeys.size,
      averagePerRecord: Math.round(item.units / item.records),
      share: operatorUnits > 0 ? Math.round((item.units / operatorUnits) * 100) : 0,
      lastProductionAt: item.lastProductionAt,
      production: item.production
    }))
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "es"));

  const items = inventoryRows.map(mapInventoryRow);
  const production = dayTotals.find((item) => item.kind === "PRODUCCION");
  const dispatch = dayTotals.find((item) => item.kind === "DESPACHO");

  return {
    date,
    inventory: items,
    movements: recentMovements,
    registeredOperators: registeredOperatorRows
      .map((row) => row.name?.trim())
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b, "es")),
    operators,
    operatorDashboard: {
      activeCount: operators.length,
      totalUnits: operatorUnits,
      averagePerOperator: operators.length > 0 ? Math.round(operatorUnits / operators.length) : 0,
      bestOperator: operators[0]?.name ?? null
    },
    dashboard: {
      totalStock: items.reduce((sumValue, item) => sumValue + item.stock, 0),
      productionToday: production?.total ?? 0,
      productionCount: production?.count ?? 0,
      dispatchToday: dispatch?.total ?? 0,
      dispatchCount: dispatch?.count ?? 0,
      lowStockCount: items.filter((item) => item.stock < item.minimumStock).length
    }
  };
}

async function getVariantContext(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  productId: string,
  variantId: string
) {
  const rows = await tx
    .select({
      productId: products.id,
      productName: products.name,
      requiresColor: products.requiresColor,
      bagType: products.bagType,
      variantId: productVariants.id,
      color: productVariants.color,
      stock: inventory.stock
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(products.id, productId), eq(productVariants.id, variantId)))
    .limit(1);
  return rows[0];
}

async function applyStockMovement(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: {
    operationId: string;
    variantId: string;
    type: "ENTRADA" | "SALIDA";
    reason: "PRODUCCION" | "DESPACHO" | "CONSUMO_BOLSA";
    quantity: number;
    occurredAt: string;
    insufficientMessage: string;
  }
) {
  const rows = await tx
    .select({ stock: inventory.stock })
    .from(inventory)
    .where(eq(inventory.variantId, input.variantId))
    .limit(1);
  const current = rows[0];
  if (!current) {
    throw new ErpBusinessError("NOT_FOUND", "No se encontró el inventario solicitado.", 404);
  }

  const nextStock = input.type === "ENTRADA" ? current.stock + input.quantity : current.stock - input.quantity;
  if (nextStock < 0) {
    throw new ErpBusinessError("INSUFFICIENT_STOCK", input.insufficientMessage, 409);
  }

  await tx
    .update(inventory)
    .set({ stock: nextStock, updatedAt: input.occurredAt })
    .where(eq(inventory.variantId, input.variantId));
  await tx.insert(movements).values({
    id: crypto.randomUUID(),
    operationId: input.operationId,
    variantId: input.variantId,
    type: input.type,
    reason: input.reason,
    quantity: input.quantity,
    stockBefore: current.stock,
    stockAfter: nextStock,
    occurredAt: input.occurredAt
  });
}

/* @section: transactional-stock-operation */
export async function createOperation(input: OperationInput) {
  if (input.quantity <= 0 || input.bagQuantity < 0) {
    throw new ErpBusinessError("INVALID_INPUT", "Las cantidades deben ser válidas.", 400);
  }
  if (input.kind === "PRODUCCION" && !input.operator?.trim()) {
    throw new ErpBusinessError("INVALID_INPUT", "El operario es obligatorio en producción.", 400);
  }

  return getDb().transaction(async (tx) => {
    const context = await getVariantContext(tx, input.productId, input.variantId);
    if (!context) {
      throw new ErpBusinessError("NOT_FOUND", "El producto o la variante no existe.", 404);
    }
    if (context.requiresColor && !context.color) {
      throw new ErpBusinessError("INVALID_INPUT", "Debes seleccionar un color.", 400);
    }

    const operationId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    await tx.insert(operations).values({
      id: operationId,
      kind: input.kind,
      productId: input.productId,
      variantId: input.variantId,
      quantity: input.quantity,
      operator: input.operator?.trim() || null,
      bagQuantity: input.bagQuantity,
      operationDate: input.operationDate,
      notes: input.notes?.trim() || null,
      createdAt: occurredAt
    });

    await applyStockMovement(tx, {
      operationId,
      variantId: input.variantId,
      type: input.kind === "PRODUCCION" ? "ENTRADA" : "SALIDA",
      reason: input.kind,
      quantity: input.quantity,
      occurredAt,
      insufficientMessage: "Stock insuficiente."
    });

    if (input.bagQuantity > 0 && context.bagType) {
      const bagProductId = context.bagType === "ALTA" ? "prod-bolsa-alta" : "prod-bolsa-baja";
      const bagRows = await tx
        .select({ variantId: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, bagProductId))
        .limit(1);
      const bagVariant = bagRows[0];
      if (!bagVariant) {
        throw new ErpBusinessError("NOT_FOUND", "No se encontró el inventario de bolsas.", 404);
      }
      await applyStockMovement(tx, {
        operationId,
        variantId: bagVariant.variantId,
        type: "SALIDA",
        reason: "CONSUMO_BOLSA",
        quantity: input.bagQuantity,
        occurredAt,
        insufficientMessage: `Stock insuficiente de Bolsas de ${context.bagType === "ALTA" ? "Alta" : "Baja"}.`
      });
    }

    return { operationId, occurredAt };
  });
}
