import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations } from "../_test/helpers";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await applyMigrations();
  await executeSql("DELETE FROM movements");
  await executeSql("DELETE FROM operations");
  await executeSql("UPDATE inventory SET stock = 0, updated_at = CURRENT_TIMESTAMP");
});

async function postOperation(body: Record<string, unknown>) {
  return app.fetch(
    new Request("http://localhost/api/erp/operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

async function snapshot() {
  const response = await app.fetch(new Request("http://localhost/api/erp?date=2026-07-20"));
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as {
    data: {
      inventory: Array<{ id: string; stock: number }>;
      movements: Array<{ type: string; reason: string; quantity: number; stockBefore: number; stockAfter: number }>;
      dashboard: { totalStock: number; productionToday: number; dispatchToday: number };
    };
  };
}

const production = {
  kind: "PRODUCCION",
  productId: "prod-mascarilla-as",
  variantId: "var-mascarilla-as",
  quantity: 120,
  operator: "Juan Pérez",
  bagQuantity: 0,
  operationDate: "2026-07-20",
  notes: "Turno mañana"
};

/* @section: erp-transaction-tests */
describe("Flexoimpress ERP inventory transactions", () => {
  it("production adds stock and records an ENTRADA movement", async () => {
    const response = await postOperation(production);
    expect(response.status).toBe(201);

    const state = await snapshot();
    const item = state.data.inventory.find((row) => row.id === "var-mascarilla-as");
    expect(item?.stock).toBe(120);
    expect(state.data.dashboard.productionToday).toBe(120);
    expect(state.data.dashboard.totalStock).toBe(120);
    expect(state.data.movements[0]).toMatchObject({
      type: "ENTRADA",
      reason: "PRODUCCION",
      quantity: 120,
      stockBefore: 0,
      stockAfter: 120
    });
  });

  it("dispatch subtracts stock and records a SALIDA movement", async () => {
    expect((await postOperation(production)).status).toBe(201);
    const response = await postOperation({
      ...production,
      kind: "DESPACHO",
      quantity: 45,
      operator: undefined,
      notes: "Entrega parcial"
    });
    expect(response.status).toBe(201);

    const state = await snapshot();
    const item = state.data.inventory.find((row) => row.id === "var-mascarilla-as");
    expect(item?.stock).toBe(75);
    expect(state.data.dashboard.dispatchToday).toBe(45);
    expect(state.data.movements[0]).toMatchObject({
      type: "SALIDA",
      reason: "DESPACHO",
      quantity: 45,
      stockBefore: 120,
      stockAfter: 75
    });
  });

  it("rejects a dispatch above available stock without changing inventory", async () => {
    const response = await postOperation({
      ...production,
      kind: "DESPACHO",
      quantity: 1,
      operator: undefined
    });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: { message?: string } };
    expect(payload.error?.message).toBe("Stock insuficiente.");

    const state = await snapshot();
    const item = state.data.inventory.find((row) => row.id === "var-mascarilla-as");
    expect(item?.stock).toBe(0);
    expect(state.data.movements).toHaveLength(0);
  });

  it("automatically consumes high bags when producing a helmet", async () => {
    expect((await postOperation({
      ...production,
      productId: "prod-bolsa-alta",
      variantId: "var-bolsa-alta",
      quantity: 10
    })).status).toBe(201);

    const helmetResponse = await postOperation({
      ...production,
      productId: "prod-casco-jockey",
      variantId: "var-cj-naranja",
      quantity: 25,
      bagQuantity: 2
    });
    expect(helmetResponse.status).toBe(201);

    const state = await snapshot();
    expect(state.data.inventory.find((row) => row.id === "var-cj-naranja")?.stock).toBe(25);
    expect(state.data.inventory.find((row) => row.id === "var-bolsa-alta")?.stock).toBe(8);
    expect(state.data.movements.some((movement) => movement.reason === "CONSUMO_BOLSA" && movement.quantity === 2)).toBe(true);
  });
});
