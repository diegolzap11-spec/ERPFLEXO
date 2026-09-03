import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../_core/db";
import { clients, dispatchOperations, dispatches, operations, productVariants, products } from "../db/schema";

export type ClientFilters = {
  ruc?: string;
  clientName?: string;
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  color?: string;
};

function buildFilterClauses(filters: ClientFilters) {
  const clauses = [];
  if (filters.ruc?.trim()) clauses.push(eq(clients.ruc, filters.ruc.trim()));
  if (filters.clientName?.trim()) {
    clauses.push(sql`lower(${clients.businessName}) like ${`%${filters.clientName.trim().toLowerCase()}%`}`);
  }
  if (filters.dateFrom) clauses.push(gte(dispatches.operationDate, filters.dateFrom));
  if (filters.dateTo) clauses.push(lte(dispatches.operationDate, filters.dateTo));
  if (filters.productId?.trim()) clauses.push(eq(operations.productId, filters.productId.trim()));
  if (filters.color?.trim()) clauses.push(eq(productVariants.color, filters.color.trim()));
  return clauses;
}

export async function findClientByRuc(ruc: string) {
  const rows = await getDb().select().from(clients).where(eq(clients.ruc, ruc.trim())).limit(1);
  return rows[0] ?? null;
}

/* @section: clients-ranking-dashboard */
export async function getClientsDashboard(filters: ClientFilters = {}) {
  const clauses = buildFilterClauses(filters);
  const rows = await getDb()
    .select({
      clientId: clients.id,
      ruc: clients.ruc,
      businessName: clients.businessName,
      dispatchCount: sql<number>`count(distinct ${dispatches.id})`.mapWith(Number),
      totalUnits: sql<number>`coalesce(sum(${operations.quantity}), 0)`.mapWith(Number),
      lastDispatchAt: sql<string | null>`max(${dispatches.operationDate})`
    })
    .from(clients)
    .innerJoin(dispatches, eq(dispatches.clientId, clients.id))
    .innerJoin(dispatchOperations, eq(dispatchOperations.dispatchId, dispatches.id))
    .innerJoin(operations, eq(operations.id, dispatchOperations.operationId))
    .innerJoin(productVariants, eq(productVariants.id, operations.variantId))
    .where(and(...clauses))
    .groupBy(clients.id, clients.ruc, clients.businessName)
    .orderBy(desc(sql`coalesce(sum(${operations.quantity}), 0)`));

  const totalClients = rows.length;
  const totalDispatches = rows.reduce((sum, row) => sum + row.dispatchCount, 0);
  const totalUnits = rows.reduce((sum, row) => sum + row.totalUnits, 0);
  const best = rows[0] ?? null;

  return {
    overview: {
      totalClients,
      totalDispatches,
      totalUnits,
      bestClient: best ? { businessName: best.businessName, ruc: best.ruc, totalUnits: best.totalUnits } : null
    },
    ranking: rows.map((row, index) => ({
      rank: index + 1,
      clientId: row.clientId,
      businessName: row.businessName,
      ruc: row.ruc,
      dispatchCount: row.dispatchCount,
      totalUnits: row.totalUnits,
      lastDispatchAt: row.lastDispatchAt
    }))
  };
}

/* @section: client-individual-summary */
export async function getClientSummary(ruc: string, filters: Omit<ClientFilters, "ruc" | "clientName"> = {}) {
  const client = await findClientByRuc(ruc);
  if (!client) return null;

  const clauses = [eq(clients.id, client.id), ...buildFilterClauses(filters)];

  const totalsRows = await getDb()
    .select({
      dispatchCount: sql<number>`count(distinct ${dispatches.id})`.mapWith(Number),
      totalUnits: sql<number>`coalesce(sum(${operations.quantity}), 0)`.mapWith(Number),
      lastDispatchAt: sql<string | null>`max(${dispatches.operationDate})`
    })
    .from(clients)
    .innerJoin(dispatches, eq(dispatches.clientId, clients.id))
    .innerJoin(dispatchOperations, eq(dispatchOperations.dispatchId, dispatches.id))
    .innerJoin(operations, eq(operations.id, dispatchOperations.operationId))
    .innerJoin(productVariants, eq(productVariants.id, operations.variantId))
    .where(and(...clauses));

  const productRows = await getDb()
    .select({
      productName: products.name,
      color: productVariants.color,
      quantity: sql<number>`coalesce(sum(${operations.quantity}), 0)`.mapWith(Number)
    })
    .from(clients)
    .innerJoin(dispatches, eq(dispatches.clientId, clients.id))
    .innerJoin(dispatchOperations, eq(dispatchOperations.dispatchId, dispatches.id))
    .innerJoin(operations, eq(operations.id, dispatchOperations.operationId))
    .innerJoin(productVariants, eq(productVariants.id, operations.variantId))
    .innerJoin(products, eq(products.id, operations.productId))
    .where(and(...clauses))
    .groupBy(products.id, productVariants.color)
    .orderBy(desc(sql`coalesce(sum(${operations.quantity}), 0)`));

  const totals = totalsRows[0] ?? { dispatchCount: 0, totalUnits: 0, lastDispatchAt: null };

  return {
    client: { ruc: client.ruc, businessName: client.businessName },
    dispatchCount: totals.dispatchCount,
    totalUnits: totals.totalUnits,
    lastDispatchAt: totals.lastDispatchAt,
    products: productRows.map((row) => ({ productName: row.productName, color: row.color, quantity: row.quantity }))
  };
}
