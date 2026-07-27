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
      movements: Array<{ type: string; reason: string; quantity: number; stockBefore: number; stockAfter: number; operator: string | null }>;
      registeredOperators: string[];
      operators: Array<{
        name: string;
        units: number;
        records: number;
        products: number;
        averagePerRecord: number;
        share: number;
        dispatchUnits: number;
        dispatchRecords: number;
        bagConsumptionUnits: number;
        bagConsumptionRecords: number;
        outputUnits: number;
        balance: number;
        activity: Array<{ reason: string; quantity: number; type: string }>;
      }>;
      operatorDashboard: {
        activeCount: number;
        totalUnits: number;
        totalDispatchUnits: number;
        totalBagConsumptionUnits: number;
        totalOutputUnits: number;
        netBalance: number;
        averagePerOperator: number;
        bestOperator: string | null;
      };
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
    expect(state.data.registeredOperators).toContain("Juan Pérez");
    expect(state.data.operators[0]).toMatchObject({
      name: "Juan Pérez",
      units: 120,
      records: 1,
      products: 1,
      averagePerRecord: 120,
      share: 100
    });
    expect(state.data.operatorDashboard).toEqual({
      activeCount: 1,
      totalUnits: 120,
      totalDispatchUnits: 0,
      totalBagConsumptionUnits: 0,
      totalOutputUnits: 0,
      netBalance: 120,
      averagePerOperator: 120,
      bestOperator: "Juan Pérez"
    });
  });

  it("dispatch subtracts stock and records a SALIDA movement", async () => {
    expect((await postOperation(production)).status).toBe(201);
    const response = await postOperation({
      ...production,
      kind: "DESPACHO",
      quantity: 45,
      operator: "María López",
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
      stockAfter: 75,
      operator: "María López"
    });
    expect(state.data.registeredOperators).toEqual(expect.arrayContaining(["Juan Pérez", "María López"]));
    expect(state.data.operators.find((item) => item.name === "María López")).toMatchObject({
      units: 0,
      dispatchUnits: 45,
      dispatchRecords: 1,
      bagConsumptionUnits: 0,
      outputUnits: 45,
      balance: -45
    });
    expect(state.data.operatorDashboard).toMatchObject({
      activeCount: 2,
      totalDispatchUnits: 45,
      totalOutputUnits: 45,
      netBalance: 75
    });
  });

  it("rejects operations without an operator before changing inventory", async () => {
    const response = await postOperation({
      ...production,
      kind: "DESPACHO",
      operator: undefined,
      quantity: 1
    });
    expect(response.status).toBe(400);

    const state = await snapshot();
    expect(state.data.inventory.find((row) => row.id === "var-mascarilla-as")?.stock).toBe(0);
    expect(state.data.movements).toHaveLength(0);
  });

  it("rejects a dispatch above available stock without changing inventory", async () => {
    const response = await postOperation({
      ...production,
      kind: "DESPACHO",
      quantity: 1,
      operator: "María López"
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
    expect(state.data.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "PRODUCCION", quantity: 25, operator: "Juan Pérez" }),
      expect.objectContaining({ reason: "CONSUMO_BOLSA", quantity: 2, operator: "Juan Pérez" })
    ]));
    const operator = state.data.operators.find((item) => item.name === "Juan Pérez");
    expect(operator).toMatchObject({
      bagConsumptionUnits: 2,
      bagConsumptionRecords: 1,
      outputUnits: 2,
      balance: 33
    });
    expect(operator?.activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "PRODUCCION", quantity: 25, type: "ENTRADA" }),
      expect.objectContaining({ reason: "CONSUMO_BOLSA", quantity: 2, type: "SALIDA" })
    ]));
  });
});
