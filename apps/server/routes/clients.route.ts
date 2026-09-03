import { apiFailure, apiSuccess } from "@repo/shared/http";
import { Context, Hono } from "hono";
import { DatabaseError } from "../_core/db";
import { publicRoute } from "../_core/route-helpers";
import { RUC_REGEX } from "../services/erp";
import { findClientByRuc, getClientsDashboard, getClientSummary } from "../services/clients";

export const isPublic = true;
export const clientsRouter = new Hono();

function errorResponse(c: Context, error: unknown) {
  if (error instanceof DatabaseError) {
    const status = error.status === 503 ? 503 : 502;
    return c.json(apiFailure(error.code, "No se pudo acceder a la base de datos."), status);
  }
  throw error;
}

function readListFilters(c: Context) {
  return {
    ruc: c.req.query("ruc") || undefined,
    clientName: c.req.query("client") || undefined,
    dateFrom: c.req.query("dateFrom") || undefined,
    dateTo: c.req.query("dateTo") || undefined,
    productId: c.req.query("productId") || undefined,
    color: c.req.query("color") || undefined
  };
}

/* @section: clients-dashboard */
const dashboardHandler = async (c: Context) => {
  try {
    return c.json(apiSuccess(await getClientsDashboard(readListFilters(c))), 200);
  } catch (error) {
    return errorResponse(c, error);
  }
};

clientsRouter.get("", publicRoute, dashboardHandler);
clientsRouter.get("/", publicRoute, dashboardHandler);

/* @section: client-ruc-lookup */
clientsRouter.get("/lookup", publicRoute, async (c) => {
  const ruc = (c.req.query("ruc") ?? "").trim();
  if (!RUC_REGEX.test(ruc)) {
    return c.json(apiFailure("INVALID_INPUT", "El RUC debe tener entre 8 y 11 dígitos."), 400);
  }
  try {
    const client = await findClientByRuc(ruc);
    return c.json(
      apiSuccess({
        found: Boolean(client),
        client: client ? { ruc: client.ruc, businessName: client.businessName } : null
      }),
      200
    );
  } catch (error) {
    return errorResponse(c, error);
  }
});

/* @section: client-individual-summary */
clientsRouter.get("/summary", publicRoute, async (c) => {
  const ruc = (c.req.query("ruc") ?? "").trim();
  if (!RUC_REGEX.test(ruc)) {
    return c.json(apiFailure("INVALID_INPUT", "El RUC debe tener entre 8 y 11 dígitos."), 400);
  }
  try {
    const summary = await getClientSummary(ruc, {
      dateFrom: c.req.query("dateFrom") || undefined,
      dateTo: c.req.query("dateTo") || undefined,
      productId: c.req.query("productId") || undefined,
      color: c.req.query("color") || undefined
    });
    if (!summary) {
      return c.json(apiFailure("NOT_FOUND", "No se encontró un cliente con ese RUC."), 404);
    }
    return c.json(apiSuccess(summary), 200);
  } catch (error) {
    return errorResponse(c, error);
  }
});
