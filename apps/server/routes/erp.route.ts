import { apiFailure, apiSuccess } from "@repo/shared/http";
import { Context, Hono } from "hono";
import { z } from "zod";
import { DatabaseError } from "../_core/db";
import { publicRoute } from "../_core/route-helpers";
import { createOperation, ErpBusinessError, getErpSnapshot, synchronizeErpSnapshot } from "../services/erp";
import { getGoogleSyncStatus } from "../services/google-sync";

export const isPublic = true;
export const erpRouter = new Hono();

const BusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const OperationSchema = z.object({
  kind: z.enum(["PRODUCCION", "DESPACHO"]),
  productId: z.string().trim().min(1),
  variantId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  operator: z.string().trim().min(1).max(120),
  bagQuantity: z.number().int().min(0).default(0),
  operationDate: BusinessDateSchema,
  notes: z.string().trim().max(500).optional()
});

const SyncSchema = z.object({
  date: BusinessDateSchema
});

function errorResponse(c: Context, error: unknown) {
  if (error instanceof ErpBusinessError) {
    return c.json(apiFailure(error.code, error.message), error.status);
  }
  if (error instanceof DatabaseError) {
    const status = error.status === 503 ? 503 : 502;
    return c.json(apiFailure(error.code, "No se pudo acceder a la base de datos."), status);
  }
  throw error;
}

/* @section: erp-public-snapshot */
const snapshotHandler = async (c: Context) => {
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json(apiFailure("INVALID_INPUT", "La fecha no es válida."), 400);
  }
  try {
    return c.json(apiSuccess(await getErpSnapshot(date)), 200);
  } catch (error) {
    return errorResponse(c, error);
  }
};

erpRouter.get("", publicRoute, snapshotHandler);
erpRouter.get("/", publicRoute, snapshotHandler);

/* @section: erp-public-operation */
const operationHandler = async (c: Context) => {
  const parsed = OperationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Completa correctamente todos los campos obligatorios."), 400);
  }
  try {
    const result = await createOperation(parsed.data);
    return c.json(apiSuccess(result), 201);
  } catch (error) {
    return errorResponse(c, error);
  }
};

erpRouter.post("/operations", publicRoute, operationHandler);

/* @section: erp-google-sync-status */
erpRouter.get("/sync/status", publicRoute, async (c) => {
  return c.json(apiSuccess(await getGoogleSyncStatus()), 200);
});

/* @section: erp-google-manual-sync */
erpRouter.post("/sync", publicRoute, async (c) => {
  const parsed = SyncSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "La fecha no es válida."), 400);
  }
  try {
    const result = await synchronizeErpSnapshot(parsed.data.date);
    if (!result.ok) {
      return c.json(apiFailure("GOOGLE_SYNC_FAILED", result.message), result.configured ? 502 : 503);
    }
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    return errorResponse(c, error);
  }
});
