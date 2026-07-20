import { apiFetch } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  CircleGauge,
  ClipboardList,
  Factory,
  Menu,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type View = "dashboard" | "inventory" | "production" | "dispatch" | "movements";
type OperationKind = "PRODUCCION" | "DESPACHO";

type InventoryItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  requiresColor: boolean;
  bagType: "ALTA" | "BAJA" | null;
  color: string | null;
  sku: string;
  stock: number;
  minimumStock: number;
  updatedAt: string;
  productSort: number;
  variantSort: number;
};

type Movement = {
  id: string;
  operationId: string;
  variantId: string;
  type: "ENTRADA" | "SALIDA";
  reason: "PRODUCCION" | "DESPACHO" | "CONSUMO_BOLSA";
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  occurredAt: string;
  productName: string;
  color: string | null;
  operator: string | null;
  notes: string | null;
};

type Snapshot = {
  date: string;
  inventory: InventoryItem[];
  movements: Movement[];
  dashboard: {
    totalStock: number;
    productionToday: number;
    productionCount: number;
    dispatchToday: number;
    dispatchCount: number;
    lowStockCount: number;
  };
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const navigation: Array<{ id: View; label: string; icon: typeof CircleGauge }> = [
  { id: "dashboard", label: "Dashboard", icon: CircleGauge },
  { id: "inventory", label: "Inventario", icon: Boxes },
  { id: "production", label: "Producción", icon: Factory },
  { id: "dispatch", label: "Despachos", icon: Truck },
  { id: "movements", label: "Movimientos", icon: ClipboardList }
];

const viewTitles: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: "Centro de control", subtitle: "Resumen operativo y alertas de inventario" },
  inventory: { title: "Inventario", subtitle: "Stock disponible por producto y variante" },
  production: { title: "Registrar producción", subtitle: "Las cantidades producidas se suman automáticamente" },
  dispatch: { title: "Registrar despacho", subtitle: "Las cantidades despachadas se descuentan con validación" },
  movements: { title: "Movimientos", subtitle: "Trazabilidad de todas las entradas y salidas" }
};

function localDateInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PE").format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

async function fetchSnapshot(date: string): Promise<Snapshot> {
  const response = await apiFetch(`/erp?date=${encodeURIComponent(date)}`, { auth: false });
  const payload = (await response.json()) as ApiEnvelope<Snapshot>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "No se pudo cargar el ERP." : payload.error.message);
  }
  return payload.data;
}

function stockStatus(item: InventoryItem) {
  if (item.stock === 0) return { label: "Sin stock", tone: "danger" };
  if (item.stock < item.minimumStock) return { label: "Stock bajo", tone: "warning" };
  return { label: "Disponible", tone: "success" };
}

/* @section: app-shell */
const Index = () => {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [businessDate, setBusinessDate] = useState(localDateInput);
  const queryClient = useQueryClient();
  const snapshotQuery = useQuery({
    queryKey: ["erp-snapshot", businessDate],
    queryFn: () => fetchSnapshot(businessDate),
    refetchInterval: 15_000,
    staleTime: 5_000
  });

  useEffect(() => {
    setMobileNav(false);
  }, [view]);

  const data = snapshotQuery.data;
  const title = viewTitles[view];

  return (
    <div className="erp-shell dark">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <Sidebar view={view} onChange={setView} open={mobileNav} onClose={() => setMobileNav(false)} />
      <div className="erp-workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <button className="icon-button mobile-menu" type="button" aria-label="Abrir menú" onClick={() => setMobileNav(true)}>
              <Menu size={20} />
            </button>
            <div>
              <p className="eyebrow">FLEXOIMPRESS ERP</p>
              <h1>{title.title}</h1>
              <p>{title.subtitle}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <label className="date-control">
              <span>Fecha operativa</span>
              <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
            </label>
            <button
              className="icon-button"
              type="button"
              aria-label="Actualizar datos"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["erp-snapshot"] })}
            >
              <RefreshCw size={18} className={snapshotQuery.isFetching ? "spin" : ""} />
            </button>
            <div className="live-pill"><span /> Sincronizado</div>
          </div>
        </header>

        <main id="main-content" className="main-content">
          {snapshotQuery.isLoading && <LoadingState />}
          {snapshotQuery.isError && (
            <ErrorState message={snapshotQuery.error.message} onRetry={() => snapshotQuery.refetch()} />
          )}
          {data && view === "dashboard" && (
            <Dashboard data={data} onNavigate={setView} />
          )}
          {data && view === "inventory" && <InventoryView items={data.inventory} />}
          {data && view === "production" && (
            <OperationForm kind="PRODUCCION" items={data.inventory} businessDate={businessDate} />
          )}
          {data && view === "dispatch" && (
            <OperationForm kind="DESPACHO" items={data.inventory} businessDate={businessDate} />
          )}
          {data && view === "movements" && <MovementsView movements={data.movements} />}
        </main>
      </div>
    </div>
  );
};

/* @section: sidebar-navigation */
function Sidebar({
  view,
  onChange,
  open,
  onClose
}: {
  view: View;
  onChange: (view: View) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && <button className="nav-scrim" aria-label="Cerrar menú" onClick={onClose} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">F</div>
          <div><strong>Flexoimpress</strong><span>Inventory ERP</span></div>
          <button className="icon-button close-nav" type="button" aria-label="Cerrar menú" onClick={onClose}><X size={18} /></button>
        </div>
        <nav aria-label="Navegación principal">
          <p className="nav-label">OPERACIONES</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => onChange(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {view === item.id && <span className="nav-indicator" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="system-card">
            <ShieldCheck size={19} />
            <div><strong>Base de datos activa</strong><span>Persistencia segura</span></div>
          </div>
          <p>Acceso público · Preparado para roles</p>
        </div>
      </aside>
    </>
  );
}

/* @section: dashboard */
function Dashboard({ data, onNavigate }: { data: Snapshot; onNavigate: (view: View) => void }) {
  const lowStock = data.inventory.filter((item) => item.stock < item.minimumStock).slice(0, 6);
  const maxFlow = Math.max(data.dashboard.productionToday, data.dashboard.dispatchToday, 1);

  return (
    <div className="view-stack animate-in">
      <section className="metric-grid" aria-label="Indicadores principales">
        <MetricCard icon={Boxes} label="Stock total" value={data.dashboard.totalStock} detail="unidades disponibles" tone="gold" />
        <MetricCard icon={ArrowUpRight} label="Producción del día" value={data.dashboard.productionToday} detail={`${data.dashboard.productionCount} registros`} tone="blue" />
        <MetricCard icon={ArrowDownRight} label="Despachos del día" value={data.dashboard.dispatchToday} detail={`${data.dashboard.dispatchCount} registros`} tone="cyan" />
        <MetricCard icon={AlertTriangle} label="Variantes en alerta" value={data.dashboard.lowStockCount} detail="por debajo del mínimo" tone="red" />
      </section>

      <section className="dashboard-grid">
        <article className="panel flow-panel">
          <div className="panel-heading">
            <div><p className="section-kicker">FLUJO DIARIO</p><h2>Entradas vs. salidas</h2></div>
            <div className="legend"><span className="legend-in">Producción</span><span className="legend-out">Despacho</span></div>
          </div>
          <div className="flow-chart" aria-label="Comparación entre producción y despachos">
            <FlowBar label="Producción" value={data.dashboard.productionToday} max={maxFlow} kind="in" />
            <FlowBar label="Despachos" value={data.dashboard.dispatchToday} max={maxFlow} kind="out" />
          </div>
          <div className="balance-row">
            <Activity size={18} />
            <span>Balance operativo del día</span>
            <strong className={data.dashboard.productionToday - data.dashboard.dispatchToday >= 0 ? "positive" : "negative"}>
              {data.dashboard.productionToday - data.dashboard.dispatchToday >= 0 ? "+" : ""}
              {formatNumber(data.dashboard.productionToday - data.dashboard.dispatchToday)} u.
            </strong>
          </div>
        </article>

        <article className="panel quick-panel">
          <div className="panel-heading"><div><p className="section-kicker">ACCESOS RÁPIDOS</p><h2>Registrar operación</h2></div></div>
          <button className="quick-action production" type="button" onClick={() => onNavigate("production")}>
            <span className="quick-icon"><Factory size={23} /></span>
            <span><strong>Nueva producción</strong><small>Sumar unidades al inventario</small></span>
            <ArrowUpRight size={20} />
          </button>
          <button className="quick-action dispatch" type="button" onClick={() => onNavigate("dispatch")}>
            <span className="quick-icon"><Truck size={23} /></span>
            <span><strong>Nuevo despacho</strong><small>Descontar unidades disponibles</small></span>
            <ArrowDownRight size={20} />
          </button>
        </article>
      </section>

      <section className="dashboard-grid lower">
        <article className="panel alerts-panel">
          <div className="panel-heading">
            <div><p className="section-kicker">ATENCIÓN REQUERIDA</p><h2>Alertas de bajo stock</h2></div>
            <button className="text-button" type="button" onClick={() => onNavigate("inventory")}>Ver inventario</button>
          </div>
          {lowStock.length === 0 ? (
            <EmptyInline icon={PackageCheck} title="Inventario saludable" text="Todas las variantes superan el stock mínimo." />
          ) : (
            <div className="alert-list">
              {lowStock.map((item) => (
                <div className="alert-row" key={item.id}>
                  <div className="product-token">{item.productName.slice(0, 2).toUpperCase()}</div>
                  <div><strong>{item.productName}</strong><span>{item.color ?? "Presentación estándar"}</span></div>
                  <div className="alert-value"><strong>{formatNumber(item.stock)}</strong><span>mín. {item.minimumStock}</span></div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel movement-panel">
          <div className="panel-heading">
            <div><p className="section-kicker">TRAZABILIDAD</p><h2>Últimos movimientos</h2></div>
            <button className="text-button" type="button" onClick={() => onNavigate("movements")}>Ver todos</button>
          </div>
          {data.movements.length === 0 ? (
            <EmptyInline icon={ClipboardList} title="Sin movimientos" text="Las operaciones aparecerán aquí automáticamente." />
          ) : (
            <div className="movement-list">
              {data.movements.slice(0, 6).map((movement) => <MovementRow key={movement.id} movement={movement} />)}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  detail: string;
  tone: "gold" | "blue" | "cyan" | "red";
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-top"><span className="metric-icon"><Icon size={21} /></span><Sparkles size={15} className="metric-spark" /></div>
      <p>{label}</p>
      <strong>{formatNumber(value)}</strong>
      <span>{detail}</span>
    </article>
  );
}

function FlowBar({ label, value, max, kind }: { label: string; value: number; max: number; kind: "in" | "out" }) {
  const width = value === 0 ? 3 : Math.max(8, Math.round((value / max) * 100));
  return (
    <div className="flow-row">
      <div className="flow-meta"><span>{label}</span><strong>{formatNumber(value)} u.</strong></div>
      <div className="flow-track"><div className={`flow-fill ${kind}`} style={{ width: `${width}%` }} /></div>
    </div>
  );
}

/* @section: inventory-view */
function InventoryView({ items }: { items: InventoryItem[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "LOW" | "AVAILABLE">("ALL");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "prod-casco-jockey": true,
    "prod-casco-minero": true
  });

  const productsGrouped = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>();
    items.forEach((item) => {
      const haystack = `${item.productName} ${item.color ?? ""} ${item.sku}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return;
      if (status === "LOW" && item.stock >= item.minimumStock) return;
      if (status === "AVAILABLE" && item.stock <= 0) return;
      const current = groups.get(item.productId) ?? [];
      current.push(item);
      groups.set(item.productId, current);
    });
    return Array.from(groups.values());
  }, [items, search, status]);

  return (
    <div className="view-stack animate-in">
      <section className="toolbar-panel">
        <label className="search-control"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto, color o SKU" /></label>
        <div className="filter-tabs" role="group" aria-label="Filtrar inventario">
          <button className={status === "ALL" ? "active" : ""} onClick={() => setStatus("ALL")} type="button">Todos</button>
          <button className={status === "AVAILABLE" ? "active" : ""} onClick={() => setStatus("AVAILABLE")} type="button">Con stock</button>
          <button className={status === "LOW" ? "active" : ""} onClick={() => setStatus("LOW")} type="button">Alertas</button>
        </div>
        <div className="inventory-summary"><span>{productsGrouped.length} productos</span><strong>{formatNumber(items.reduce((sum, item) => sum + item.stock, 0))} unidades</strong></div>
      </section>

      <section className="inventory-list" aria-live="polite">
        {productsGrouped.map((group) => {
          const first = group[0];
          const total = group.reduce((sum, item) => sum + item.stock, 0);
          const isExpanded = first.requiresColor ? expanded[first.productId] !== false : true;
          return (
            <article className="product-panel" key={first.productId}>
              <button
                type="button"
                className="product-header"
                onClick={() => first.requiresColor && setExpanded((previous) => ({ ...previous, [first.productId]: !isExpanded }))}
                aria-expanded={isExpanded}
              >
                <div className="product-token large">{first.productName.slice(0, 2).toUpperCase()}</div>
                <div className="product-identity"><strong>{first.productName}</strong><span>SKU {first.productSku} · {group.length} {group.length === 1 ? "presentación" : "variantes"}</span></div>
                <div className="product-total"><span>Stock total</span><strong>{formatNumber(total)}</strong></div>
                {first.requiresColor && <ChevronDown size={20} className={isExpanded ? "chevron-open" : ""} />}
              </button>
              {isExpanded && (
                <div className="variant-table-wrap">
                  <table className="data-table inventory-table">
                    <thead><tr><th>Variante</th><th>SKU</th><th>Stock actual</th><th>Stock mínimo</th><th>Estado</th><th>Actualizado</th></tr></thead>
                    <tbody>
                      {group.map((item) => {
                        const state = stockStatus(item);
                        return (
                          <tr key={item.id}>
                            <td data-label="Variante"><div className="variant-name">{item.color && <span className={`color-dot color-${item.color.toLowerCase().replace("ó", "o")}`} />}<strong>{item.color ?? "Estándar"}</strong></div></td>
                            <td data-label="SKU"><code>{item.sku}</code></td>
                            <td data-label="Stock actual"><strong className="stock-number">{formatNumber(item.stock)}</strong></td>
                            <td data-label="Stock mínimo">{formatNumber(item.minimumStock)}</td>
                            <td data-label="Estado"><span className={`status-badge ${state.tone}`}>{state.label}</span></td>
                            <td data-label="Actualizado">{formatDateTime(item.updatedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          );
        })}
        {productsGrouped.length === 0 && <EmptyPanel title="No hay resultados" text="Prueba con otro término o filtro." />}
      </section>
    </div>
  );
}

/* @section: operation-form */
function OperationForm({ kind, items, businessDate }: { kind: OperationKind; items: InventoryItem[]; businessDate: string }) {
  const queryClient = useQueryClient();
  const productGroups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    items.forEach((item) => map.set(item.productId, [...(map.get(item.productId) ?? []), item]));
    return Array.from(map.values());
  }, [items]);
  const [productId, setProductId] = useState(productGroups[0]?.[0].productId ?? "");
  const selectedGroup = productGroups.find((group) => group[0].productId === productId) ?? productGroups[0] ?? [];
  const [variantId, setVariantId] = useState(selectedGroup[0]?.id ?? "");
  const selectedItem = items.find((item) => item.id === variantId) ?? selectedGroup[0];
  const [quantity, setQuantity] = useState("");
  const [operator, setOperator] = useState("");
  const [bagQuantity, setBagQuantity] = useState("0");
  const [operationDate, setOperationDate] = useState(businessDate);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setVariantId(selectedGroup[0]?.id ?? "");
  }, [productId]);

  useEffect(() => {
    setOperationDate(businessDate);
  }, [businessDate]);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/erp/operations", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          productId,
          variantId,
          quantity: Number(quantity),
          operator: kind === "PRODUCCION" ? operator : undefined,
          bagQuantity: Number(bagQuantity || 0),
          operationDate,
          notes: notes || undefined
        })
      });
      const payload = (await response.json()) as ApiEnvelope<{ operationId: string }>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "No se pudo registrar la operación." : payload.error.message);
      }
      return payload.data;
    },
    onSuccess: async () => {
      toast.success(kind === "PRODUCCION" ? "Producción registrada y stock actualizado." : "Despacho registrado y stock actualizado.");
      setQuantity("");
      setBagQuantity("0");
      setNotes("");
      if (kind === "PRODUCCION") setOperator("");
      await queryClient.invalidateQueries({ queryKey: ["erp-snapshot"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const newStock = selectedItem
    ? kind === "PRODUCCION"
      ? selectedItem.stock + (Number(quantity) || 0)
      : selectedItem.stock - (Number(quantity) || 0)
    : 0;
  const canSubmit = Boolean(productId && variantId && Number(quantity) > 0 && operationDate && (kind === "DESPACHO" || operator.trim()));

  return (
    <div className="operation-layout animate-in">
      <section className="panel form-panel">
        <div className="panel-heading form-heading">
          <div><p className="section-kicker">{kind === "PRODUCCION" ? "ENTRADA DE INVENTARIO" : "SALIDA DE INVENTARIO"}</p><h2>{kind === "PRODUCCION" ? "Datos de producción" : "Datos del despacho"}</h2></div>
          <span className={`operation-kind ${kind === "PRODUCCION" ? "in" : "out"}`}>{kind === "PRODUCCION" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}{kind}</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
          className="erp-form"
        >
          <div className="form-grid">
            <label className="field"><span>Producto *</span><select value={productId} onChange={(event) => setProductId(event.target.value)}>{productGroups.map((group) => <option key={group[0].productId} value={group[0].productId}>{group[0].productName}</option>)}</select></label>
            {selectedGroup[0]?.requiresColor ? (
              <label className="field"><span>Color *</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)}>{selectedGroup.map((item) => <option key={item.id} value={item.id}>{item.color}</option>)}</select></label>
            ) : (
              <label className="field"><span>Presentación</span><input value="Estándar" disabled /></label>
            )}
            <label className="field"><span>Cantidad *</span><input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" /></label>
            {kind === "PRODUCCION" && <label className="field"><span>Operario *</span><input value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="Nombre del operario" /></label>}
            {selectedItem?.bagType && (
              <label className="field"><span>Bolsas utilizadas ({selectedItem.bagType === "ALTA" ? "Alta" : "Baja"})</span><input type="number" min="0" step="1" inputMode="numeric" value={bagQuantity} onChange={(event) => setBagQuantity(event.target.value)} /></label>
            )}
            <label className="field"><span>Fecha *</span><input type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} /></label>
            <label className="field field-wide"><span>Observaciones</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={500} placeholder="Información adicional (opcional)" /></label>
          </div>
          <div className="form-footer">
            <p><ShieldCheck size={16} /> Operación transaccional: inventario y movimiento se actualizan juntos.</p>
            <button className="primary-button" type="submit" disabled={!canSubmit || mutation.isPending}>{mutation.isPending ? <><RefreshCw size={17} className="spin" /> Procesando…</> : kind === "PRODUCCION" ? <><Factory size={18} /> Registrar producción</> : <><Truck size={18} /> Registrar despacho</>}</button>
          </div>
        </form>
      </section>

      <aside className="operation-summary">
        <article className="panel stock-preview">
          <p className="section-kicker">VISTA PREVIA</p>
          <div className="preview-product"><div className="product-token large">{selectedItem?.productName.slice(0, 2).toUpperCase() ?? "--"}</div><div><strong>{selectedItem?.productName ?? "Selecciona un producto"}</strong><span>{selectedItem?.color ?? "Presentación estándar"}</span></div></div>
          <div className="stock-equation">
            <div><span>Stock actual</span><strong>{formatNumber(selectedItem?.stock ?? 0)}</strong></div>
            <span className={`equation-sign ${kind === "PRODUCCION" ? "positive" : "negative"}`}>{kind === "PRODUCCION" ? "+" : "−"}</span>
            <div><span>{kind === "PRODUCCION" ? "A producir" : "A despachar"}</span><strong>{formatNumber(Number(quantity) || 0)}</strong></div>
          </div>
          <div className={`new-stock ${newStock < 0 ? "invalid" : ""}`}><span>Stock resultante</span><strong>{formatNumber(newStock)}</strong></div>
          {newStock < 0 && <div className="inline-warning"><AlertTriangle size={17} /><span>Stock insuficiente. La operación será cancelada.</span></div>}
          {Number(bagQuantity) > 0 && selectedItem?.bagType && <div className="bag-note"><PackageCheck size={17} /><span>Se descontarán automáticamente {formatNumber(Number(bagQuantity))} Bolsas de {selectedItem.bagType === "ALTA" ? "Alta" : "Baja"}.</span></div>}
        </article>
        <article className="integrity-card"><ShieldCheck size={22} /><div><strong>Control de integridad</strong><span>No se permite stock negativo y cada cambio queda registrado.</span></div></article>
      </aside>
    </div>
  );
}

/* @section: movements-view */
function MovementsView({ movements }: { movements: Movement[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"ALL" | "ENTRADA" | "SALIDA">("ALL");
  const filtered = movements.filter((movement) => {
    const matchesType = type === "ALL" || movement.type === type;
    const haystack = `${movement.productName} ${movement.color ?? ""} ${movement.operator ?? ""} ${movement.reason}`.toLowerCase();
    return matchesType && haystack.includes(search.toLowerCase());
  });

  return (
    <div className="view-stack animate-in">
      <section className="toolbar-panel">
        <label className="search-control"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en movimientos" /></label>
        <div className="filter-tabs" role="group" aria-label="Filtrar movimientos">
          <button className={type === "ALL" ? "active" : ""} onClick={() => setType("ALL")} type="button">Todos</button>
          <button className={type === "ENTRADA" ? "active" : ""} onClick={() => setType("ENTRADA")} type="button">Entradas</button>
          <button className={type === "SALIDA" ? "active" : ""} onClick={() => setType("SALIDA")} type="button">Salidas</button>
        </div>
        <div className="inventory-summary"><span>Trazabilidad</span><strong>{filtered.length} movimientos</strong></div>
      </section>
      <section className="panel table-panel">
        {filtered.length === 0 ? <EmptyPanel title="Sin movimientos" text="Los registros de producción y despacho aparecerán aquí." /> : (
          <div className="table-scroll">
            <table className="data-table movements-table">
              <thead><tr><th>Fecha y hora</th><th>Producto</th><th>Tipo</th><th>Motivo</th><th>Cantidad</th><th>Stock antes</th><th>Stock después</th><th>Operario</th></tr></thead>
              <tbody>{filtered.map((movement) => (
                <tr key={movement.id}>
                  <td data-label="Fecha y hora">{formatDateTime(movement.occurredAt)}</td>
                  <td data-label="Producto"><strong>{movement.productName}</strong><small>{movement.color ?? "Estándar"}</small></td>
                  <td data-label="Tipo"><span className={`movement-type ${movement.type === "ENTRADA" ? "in" : "out"}`}>{movement.type === "ENTRADA" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{movement.type}</span></td>
                  <td data-label="Motivo">{movement.reason.replace("_", " ")}</td>
                  <td data-label="Cantidad"><strong className={movement.type === "ENTRADA" ? "positive" : "negative"}>{movement.type === "ENTRADA" ? "+" : "−"}{formatNumber(movement.quantity)}</strong></td>
                  <td data-label="Stock antes">{formatNumber(movement.stockBefore)}</td>
                  <td data-label="Stock después"><strong>{formatNumber(movement.stockAfter)}</strong></td>
                  <td data-label="Operario">{movement.operator ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MovementRow({ movement }: { movement: Movement }) {
  return (
    <div className="movement-row">
      <span className={`movement-arrow ${movement.type === "ENTRADA" ? "in" : "out"}`}>{movement.type === "ENTRADA" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span>
      <div><strong>{movement.productName}{movement.color ? ` · ${movement.color}` : ""}</strong><span>{movement.reason.replace("_", " ")} · {formatDateTime(movement.occurredAt)}</span></div>
      <strong className={movement.type === "ENTRADA" ? "positive" : "negative"}>{movement.type === "ENTRADA" ? "+" : "−"}{formatNumber(movement.quantity)}</strong>
    </div>
  );
}

function LoadingState() {
  return <div className="state-panel"><RefreshCw size={28} className="spin" /><h2>Cargando inventario</h2><p>Conectando con la fuente de verdad…</p></div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="state-panel error"><AlertTriangle size={30} /><h2>No se pudo cargar el sistema</h2><p>{message}</p><button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={17} /> Reintentar</button></div>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="empty-panel"><ClipboardList size={26} /><h3>{title}</h3><p>{text}</p></div>;
}

function EmptyInline({ icon: Icon, title, text }: { icon: typeof PackageCheck; title: string; text: string }) {
  return <div className="empty-inline"><Icon size={22} /><div><strong>{title}</strong><span>{text}</span></div></div>;
}

export default Index;
