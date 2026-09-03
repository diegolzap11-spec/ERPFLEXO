import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations } from "../_test/helpers";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await applyMigrations();
  await executeSql("DELETE FROM dispatch_operations");
  await executeSql("DELETE FROM movements");
  await executeSql("DELETE FROM operations");
  await executeSql("DELETE FROM dispatches");
  await executeSql("DELETE FROM clients");
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

async function seedStock(productId: string, variantId: string, quantity: number) {
  const response = await postOperation({
    kind: "PRODUCCION",
    productId,
    variantId,
    quantity,
    operator: "Sembrado",
    bagQuantity: 0,
    operationDate: "2026-07-20"
  });
  expect(response.status, await response.clone().text()).toBe(201);
}

async function postDispatch(body: Record<string, unknown>) {
  return app.fetch(
    new Request("http://localhost/api/erp/dispatches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

async function getClientsDashboard(query = "") {
  const response = await app.fetch(new Request(`http://localhost/api/clients${query}`));
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as {
    data: {
      overview: { totalClients: number; totalDispatches: number; totalUnits: number; bestClient: { businessName: string; ruc: string; totalUnits: number } | null };
      ranking: Array<{ rank: number; clientId: string; businessName: string; ruc: string; dispatchCount: number; totalUnits: number; lastDispatchAt: string | null }>;
    };
  };
}

async function getClientLookup(ruc: string) {
  const response = await app.fetch(new Request(`http://localhost/api/clients/lookup?ruc=${ruc}`));
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { data: { found: boolean; client: { ruc: string; businessName: string } | null } };
}

async function getClientSummary(ruc: string, query = "") {
  return app.fetch(new Request(`http://localhost/api/clients/summary?ruc=${ruc}${query}`));
}

async function erpSnapshot(date = "2026-07-20") {
  const response = await app.fetch(new Request(`http://localhost/api/erp?date=${date}`));
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as {
    data: {
      inventory: Array<{ id: string; stock: number }>;
      movements: Array<{ type: string; reason: string; quantity: number; operator: string | null }>;
    };
  };
}

function stockOf(snapshot: Awaited<ReturnType<typeof erpSnapshot>>, variantId: string) {
  return snapshot.data.inventory.find((item) => item.id === variantId)?.stock;
}

const CLIENT_A_RUC = "20100000001";
const CLIENT_B_RUC = "20100000002";

/* @section: multiline-dispatch-and-clients-tests */
describe("Multi-line dispatches and client analytics", () => {
  it("creates a new client when the RUC does not exist", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 100);

    const response = await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 30 }]
    });
    expect(response.status, await response.clone().text()).toBe(201);

    const lookup = await getClientLookup(CLIENT_A_RUC);
    expect(lookup.data).toEqual({ found: true, client: { ruc: CLIENT_A_RUC, businessName: "Constructora Andina SAC" } });

    const dashboard = await getClientsDashboard();
    expect(dashboard.data.overview.totalClients).toBe(1);
    expect(dashboard.data.ranking[0]).toMatchObject({ ruc: CLIENT_A_RUC, businessName: "Constructora Andina SAC", dispatchCount: 1, totalUnits: 30 });
  });

  it("requires a business name for a brand-new RUC", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 100);
    const response = await postDispatch({
      ruc: CLIENT_A_RUC,
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 10 }]
    });
    expect(response.status).toBe(400);

    const dashboard = await getClientsDashboard();
    expect(dashboard.data.overview.totalClients).toBe(0);
  });

  it("rejects malformed RUC values", async () => {
    const response = await postDispatch({
      ruc: "abc",
      businessName: "Cliente inválido",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 1 }]
    });
    expect(response.status).toBe(400);
  });

  it("reuses an existing client by RUC instead of creating a duplicate", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 200);

    const first = await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 10 }]
    });
    expect(first.status).toBe(201);

    // Second dispatch omits businessName entirely — it must still succeed by reusing the client.
    const second = await postDispatch({
      ruc: CLIENT_A_RUC,
      operationDate: "2026-07-20",
      operator: "María López",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 20 }]
    });
    expect(second.status, await second.clone().text()).toBe(201);

    const dashboard = await getClientsDashboard();
    expect(dashboard.data.overview.totalClients).toBe(1);
    expect(dashboard.data.ranking[0]).toMatchObject({ ruc: CLIENT_A_RUC, dispatchCount: 2, totalUnits: 30 });

    const lookup = await getClientLookup(CLIENT_A_RUC);
    expect(lookup.data.client?.businessName).toBe("Constructora Andina SAC");
  });

  it("registers a single-line dispatch and discounts stock", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 100);
    const response = await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 30 }]
    });
    expect(response.status).toBe(201);

    const snapshot = await erpSnapshot();
    expect(stockOf(snapshot, "var-mascarilla-as")).toBe(70);
    expect(snapshot.data.movements[0]).toMatchObject({ type: "SALIDA", reason: "DESPACHO", quantity: 30, operator: "Juan Pérez" });
  });

  it("registers a multi-line dispatch across different products and colors", async () => {
    await seedStock("prod-casco-jockey", "var-cj-blanco", 100);
    await seedStock("prod-casco-jockey", "var-cj-amarillo", 100);
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 50);

    const response = await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      notes: "Entrega de obra",
      items: [
        { productId: "prod-casco-jockey", variantId: "var-cj-blanco", quantity: 20 },
        { productId: "prod-casco-jockey", variantId: "var-cj-amarillo", quantity: 15 },
        { productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 10 }
      ]
    });
    expect(response.status, await response.clone().text()).toBe(201);

    const snapshot = await erpSnapshot();
    expect(stockOf(snapshot, "var-cj-blanco")).toBe(80);
    expect(stockOf(snapshot, "var-cj-amarillo")).toBe(85);
    expect(stockOf(snapshot, "var-mascarilla-as")).toBe(40);

    const dispatchMovements = snapshot.data.movements.filter((m) => m.reason === "DESPACHO");
    expect(dispatchMovements).toHaveLength(3);
    expect(dispatchMovements.every((m) => m.operator === "Juan Pérez")).toBe(true);
  });

  it("sums repeated lines of the same variant before rejecting insufficient stock", async () => {
    await seedStock("prod-casco-jockey", "var-cj-blanco", 1300);

    const response = await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [
        { productId: "prod-casco-jockey", variantId: "var-cj-blanco", quantity: 700 },
        { productId: "prod-casco-jockey", variantId: "var-cj-blanco", quantity: 700 }
      ]
    });
    expect(response.status).toBe(409);

    const snapshot = await erpSnapshot();
    expect(stockOf(snapshot, "var-cj-blanco")).toBe(1300);
    expect(snapshot.data.movements.filter((m) => m.reason === "DESPACHO")).toHaveLength(0);

    const dashboard = await getClientsDashboard();
    expect(dashboard.data.overview.totalClients).toBe(0);
  });

  it("rejects a dispatch that would push stock negative", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 5);
    const response = await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 6 }]
    });
    expect(response.status).toBe(409);

    const snapshot = await erpSnapshot();
    expect(stockOf(snapshot, "var-mascarilla-as")).toBe(5);
  });

  it("rolls back the entire dispatch, including earlier valid lines, when one line fails", async () => {
    await seedStock("prod-casco-jockey", "var-cj-blanco", 50);
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 5);

    const response = await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [
        { productId: "prod-casco-jockey", variantId: "var-cj-blanco", quantity: 20 },
        { productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 999 }
      ]
    });
    expect(response.status).toBe(409);

    const snapshot = await erpSnapshot();
    // The first line must NOT have been committed even though it was valid on its own.
    expect(stockOf(snapshot, "var-cj-blanco")).toBe(50);
    expect(stockOf(snapshot, "var-mascarilla-as")).toBe(5);
    expect(snapshot.data.movements.filter((m) => m.reason === "DESPACHO")).toHaveLength(0);

    const dashboard = await getClientsDashboard();
    expect(dashboard.data.overview.totalClients).toBe(0);
  });

  it("keeps legacy single-item dispatches (without a client) visible in the kardex", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 40);
    const response = await postOperation({
      kind: "DESPACHO",
      productId: "prod-mascarilla-as",
      variantId: "var-mascarilla-as",
      quantity: 10,
      operator: "Operario Antiguo",
      bagQuantity: 0,
      operationDate: "2026-07-20"
    });
    expect(response.status).toBe(201);

    const snapshot = await erpSnapshot();
    expect(stockOf(snapshot, "var-mascarilla-as")).toBe(30);
    expect(snapshot.data.movements[0]).toMatchObject({ type: "SALIDA", reason: "DESPACHO", quantity: 10 });

    // Legacy dispatches have no client link, so they must not appear in client analytics.
    const dashboard = await getClientsDashboard();
    expect(dashboard.data.overview.totalClients).toBe(0);
    expect(dashboard.data.ranking).toHaveLength(0);
  });

  it("ranks clients by total dispatched units, descending", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 200);

    await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Cliente Pequeño SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 10 }]
    });
    await postDispatch({
      ruc: CLIENT_B_RUC,
      businessName: "Cliente Grande SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 80 }]
    });

    const dashboard = await getClientsDashboard();
    expect(dashboard.data.ranking.map((row) => row.ruc)).toEqual([CLIENT_B_RUC, CLIENT_A_RUC]);
    expect(dashboard.data.overview.bestClient).toMatchObject({ ruc: CLIENT_B_RUC, totalUnits: 80 });
  });

  it("filters the client dashboard by RUC, date range, product and color", async () => {
    await seedStock("prod-casco-jockey", "var-cj-blanco", 200);
    await seedStock("prod-casco-jockey", "var-cj-amarillo", 200);

    await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Cliente Uno SAC",
      operationDate: "2026-07-01",
      operator: "Juan Pérez",
      items: [{ productId: "prod-casco-jockey", variantId: "var-cj-blanco", quantity: 10 }]
    });
    await postDispatch({
      ruc: CLIENT_B_RUC,
      businessName: "Cliente Dos SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-casco-jockey", variantId: "var-cj-amarillo", quantity: 15 }]
    });

    const byRuc = await getClientsDashboard(`?ruc=${CLIENT_A_RUC}`);
    expect(byRuc.data.ranking).toHaveLength(1);
    expect(byRuc.data.ranking[0].ruc).toBe(CLIENT_A_RUC);

    const byDate = await getClientsDashboard("?dateFrom=2026-07-15&dateTo=2026-07-25");
    expect(byDate.data.ranking).toHaveLength(1);
    expect(byDate.data.ranking[0].ruc).toBe(CLIENT_B_RUC);

    const byColor = await getClientsDashboard("?color=Amarillo");
    expect(byColor.data.ranking).toHaveLength(1);
    expect(byColor.data.ranking[0].ruc).toBe(CLIENT_B_RUC);
  });

  it("returns an individual client summary with products purchased grouped by color", async () => {
    await seedStock("prod-casco-jockey", "var-cj-blanco", 200);
    await seedStock("prod-casco-jockey", "var-cj-amarillo", 200);

    await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [
        { productId: "prod-casco-jockey", variantId: "var-cj-blanco", quantity: 30 },
        { productId: "prod-casco-jockey", variantId: "var-cj-amarillo", quantity: 12 }
      ]
    });

    const response = await getClientSummary(CLIENT_A_RUC);
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = (await response.json()) as {
      data: {
        client: { ruc: string; businessName: string };
        dispatchCount: number;
        totalUnits: number;
        products: Array<{ productName: string; color: string | null; quantity: number }>;
      };
    };
    expect(payload.data.client).toEqual({ ruc: CLIENT_A_RUC, businessName: "Constructora Andina SAC" });
    expect(payload.data.dispatchCount).toBe(1);
    expect(payload.data.totalUnits).toBe(42);
    expect(payload.data.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productName: "Casco Jockey", color: "Blanco", quantity: 30 }),
        expect.objectContaining({ productName: "Casco Jockey", color: "Amarillo", quantity: 12 })
      ])
    );
  });

  it("returns 404 for a summary of an unknown RUC", async () => {
    const response = await getClientSummary("20999999999");
    expect(response.status).toBe(404);
  });

  it("keeps production unaffected when multi-line dispatches are also used", async () => {
    await seedStock("prod-mascarilla-as", "var-mascarilla-as", 100);
    await postDispatch({
      ruc: CLIENT_A_RUC,
      businessName: "Constructora Andina SAC",
      operationDate: "2026-07-20",
      operator: "Juan Pérez",
      items: [{ productId: "prod-mascarilla-as", variantId: "var-mascarilla-as", quantity: 40 }]
    });

    const secondProduction = await postOperation({
      kind: "PRODUCCION",
      productId: "prod-mascarilla-as",
      variantId: "var-mascarilla-as",
      quantity: 25,
      operator: "Juan Pérez",
      bagQuantity: 0,
      operationDate: "2026-07-20"
    });
    expect(secondProduction.status).toBe(201);

    const snapshot = await erpSnapshot();
    expect(stockOf(snapshot, "var-mascarilla-as")).toBe(85);
    expect(snapshot.data.movements.filter((m) => m.reason === "PRODUCCION")).toHaveLength(2);
  });
});
