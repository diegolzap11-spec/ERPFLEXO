import { apiFetch } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Building2,
  ChevronDown,
  CircleGauge,
  ClipboardList,
  Factory,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Truck,
  UserRound,
  WifiOff,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type View = "dashboard" | "inventory" | "production" | "operators" | "dispatch" | "movements" | "clients";
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

type OperatorProduction = {
  id: string;
  productName: string;
  color: string | null;
  quantity: number;
  occurredAt: string;
};

type OperatorActivity = OperatorProduction & {
  operationId: string;
  type: "ENTRADA" | "SALIDA";
  reason: "PRODUCCION" | "DESPACHO" | "CONSUMO_BOLSA";
};

type OperatorSummary = {
  name: string;
  units: number;
  records: number;
  products: number;
  averagePerRecord: number;
  share: number;
  lastProductionAt: string | null;
  lastActivityAt: string;
  dispatchUnits: number;
  dispatchRecords: number;
  bagConsumptionUnits: number;
  bagConsumptionRecords: number;
  outputUnits: number;
  balance: number;
  production: OperatorProduction[];
  activity: OperatorActivity[];
};

type Snapshot = {
  date: string;
  inventory: InventoryItem[];
  movements: Movement[];
  registeredOperators: string[];
  operators: OperatorSummary[];
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
  dashboard: {
    totalStock: number;
    productionToday: number;
    productionCount: number;
    dispatchToday: number;
    dispatchCount: number;
    lowStockCount: number;
  };
};

/* @section: clients-dispatch-types */
type ClientRef = { ruc: string; businessName: string };

type ClientOverview = {
  totalClients: number;
  totalDispatches: number;
  totalUnits: number;
  bestClient: { businessName: string; ruc: string; totalUnits: number } | null;
};

type ClientRankingRow = {
  rank: number;
  clientId: string;
  businessName: string;
  ruc: string;
  dispatchCount: number;
  totalUnits: number;
  lastDispatchAt: string | null;
};

type ClientsDashboard = {
  overview: ClientOverview;
  ranking: ClientRankingRow[];
};

type ClientProductLine = {
  productName: string;
  color: string | null;
  quantity: number;
};

type ClientSummary = {
  client: ClientRef;
  dispatchCount: number;
  totalUnits: number;
  lastDispatchAt: string | null;
  products: ClientProductLine[];
};

type ClientFiltersState = {
  ruc: string;
  client: string;
  dateFrom: string;
  dateTo: string;
  productId: string;
  color: string;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type GoogleSyncResult = {
  ok: boolean;
  configured: boolean;
  skipped?: boolean;
  syncedAt?: string;
  message: string;
};

type GoogleSyncStatus = {
  configured: boolean;
  reachable: boolean;
  lastSyncAt?: string;
  message: string;
};

const navigation: Array<{ id: View; label: string; icon: typeof CircleGauge }> = [
  { id: "dashboard", label: "Dashboard", icon: CircleGauge },
  { id: "inventory", label: "Inventario", icon: Boxes },
  { id: "production", label: "Producción", icon: Factory },
  { id: "operators", label: "Operarios", icon: Users },
  { id: "dispatch", label: "Despachos", icon: Truck },
  { id: "clients", label: "Clientes", icon: Building2 },
  { id: "movements", label: "Movimientos", icon: ClipboardList }
];

const viewTitles: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: "Centro de control", subtitle: "Resumen operativo y alertas de inventario" },
  inventory: { title: "Inventario", subtitle: "Stock disponible por producto y variante" },
  production: { title: "Registrar producción", subtitle: "Las cantidades producidas se suman automáticamente" },
  operators: { title: "Actividad de operarios", subtitle: "Producción, despachos y consumo de bolsas por responsable" },
  dispatch: { title: "Registrar despacho", subtitle: "Despacho multilínea: varios productos, un solo cliente" },
  clients: { title: "Clientes", subtitle: "Ranking, filtros y consulta individual por RUC" },
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

/* @section: google-sync-client */
async function fetchGoogleSyncStatus(): Promise<GoogleSyncStatus> {
  const response = await apiFetch("/erp/sync/status", { auth: false });
  const payload = (await response.json()) as ApiEnvelope<GoogleSyncStatus>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "No se pudo comprobar Google." : payload.error.message);
  }
  return payload.data;
}

async function synchronizeGoogle(date: string): Promise<GoogleSyncResult> {
  const response = await apiFetch("/erp/sync", {
    method: "POST",
    auth: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date })
  });
  const payload = (await response.json()) as ApiEnvelope<GoogleSyncResult>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "No se pudo sincronizar Google." : payload.error.message);
  }
  return payload.data;
}

/* @section: clients-dispatch-client */
function buildClientFiltersQuery(filters: Partial<ClientFiltersState>) {
  const params = new URLSearchParams();
  if (filters.ruc) params.set("ruc", filters.ruc);
  if (filters.client) params.set("client", filters.client);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.color) params.set("color", filters.color);
  return params.toString();
}

async function fetchClientsDashboard(filters: ClientFiltersState): Promise<ClientsDashboard> {
  const query = buildClientFiltersQuery(filters);
  const response = await apiFetch(`/clients${query ? `?${query}` : ""}`, { auth: false });
  const payload = (await response.json()) as ApiEnvelope<ClientsDashboard>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "No se pudo cargar la información de clientes." : payload.error.message);
  }
  return payload.data;
}

async function fetchClientLookup(ruc: string): Promise<{ found: boolean; client: ClientRef | null }> {
  const response = await apiFetch(`/clients/lookup?ruc=${encodeURIComponent(ruc)}`, { auth: false });
  const payload = (await response.json()) as ApiEnvelope<{ found: boolean; client: ClientRef | null }>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "No se pudo buscar el cliente." : payload.error.message);
  }
  return payload.data;
}

async function fetchClientSummary(ruc: string, filters: Partial<ClientFiltersState>): Promise<ClientSummary> {
  const query = buildClientFiltersQuery(filters);
  const response = await apiFetch(`/clients/summary?ruc=${encodeURIComponent(ruc)}${query ? `&${query}` : ""}`, { auth: false });
  const payload = (await response.json()) as ApiEnvelope<ClientSummary>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "No se pudo cargar el resumen del cliente." : payload.error.message);
  }
  return payload.data;
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
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
  const googleStatusQuery = useQuery({
    queryKey: ["google-sync-status"],
    queryFn: fetchGoogleSyncStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1
  });
  const googleSyncMutation = useMutation({
    mutationFn: () => synchronizeGoogle(businessDate),
    onSuccess: async (result) => {
      toast.success(result.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["google-sync-status"] }),
        queryClient.invalidateQueries({ queryKey: ["erp-snapshot"] })
      ]);
    },
    onError: (error) => toast.error(error.message)
  });

  useEffect(() => {
    setMobileNav(false);
  }, [view]);

  const data = snapshotQuery.data;
  const title = viewTitles[view];
  const googleStatus = googleStatusQuery.data;
  const googleTone = googleSyncMutation.isPending
    ? "pending"
    : googleStatus?.configured && googleStatus.reachable
      ? "ready"
      : "warning";
  const googleLabel = googleSyncMutation.isPending
    ? "Sincronizando…"
    : googleStatus?.configured && googleStatus.reachable
      ? googleStatus.lastSyncAt
        ? `Actualizado ${formatDateTime(googleStatus.lastSyncAt)}`
        : "Conectado"
      : googleStatusQuery.isLoading
        ? "Comprobando…"
        : "Reintentar";

  return (
    <div className="erp-shell dark black-console">
      {/* @section: black-console-visuals */}
      <style>{`
        .erp-shell.black-console,
        .erp-shell.black-console .erp-workspace {
          background: #000;
        }
        .erp-shell.black-console .erp-workspace {
          background-image:
            linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px),
            radial-gradient(circle at 90% 0%, rgba(37,112,255,.10), transparent 29rem),
            radial-gradient(circle at 10% 100%, rgba(255,203,0,.055), transparent 24rem);
          background-size: 32px 32px, 32px 32px, auto, auto;
          background-attachment: fixed;
        }
        .erp-shell.black-console .sidebar,
        .erp-shell.black-console .topbar {
          background-color: rgba(0,0,0,.92);
        }
        .erp-shell.black-console .panel,
        .erp-shell.black-console .metric-card,
        .erp-shell.black-console .toolbar-panel,
        .erp-shell.black-console .product-panel {
          background: linear-gradient(145deg, rgba(18,22,29,.96), rgba(6,8,11,.97));
        }
        .system-status {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 166px;
          padding: 8px 10px;
          border: 1px solid rgba(255,203,0,.16);
          border-radius: 10px;
          color: #ffcb00;
          background: rgba(255,203,0,.045);
        }
        .system-status > div { display: flex; flex-direction: column; }
        .system-status span { color: #8c96a7; font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .system-status strong { margin-top: 2px; color: #e6ebf3; font-size: 9px; font-weight: 700; }
        .google-sync-control {
          display: flex;
          min-width: 176px;
          min-height: 40px;
          align-items: center;
          gap: 9px;
          padding: 7px 10px;
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 10px;
          color: #8c96a7;
          background: rgba(255,255,255,.025);
          text-align: left;
          transition: border-color .18s ease, background .18s ease, color .18s ease;
        }
        .google-sync-control > div { display: flex; min-width: 0; flex-direction: column; }
        .google-sync-control span { color: #737e90; font-size: 7px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
        .google-sync-control strong { max-width: 148px; margin-top: 2px; overflow: hidden; color: #dbe2ec; font-size: 8px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
        .google-sync-control.ready { border-color: rgba(76,203,145,.22); color: #66d39c; background: rgba(48,159,111,.07); }
        .google-sync-control.warning { border-color: rgba(235,177,75,.23); color: #e3b45e; background: rgba(194,134,31,.065); }
        .google-sync-control.pending { border-color: rgba(79,143,255,.28); color: #70a4ff; background: rgba(54,119,239,.08); }
        .google-sync-control:hover:not(:disabled) { border-color: rgba(90,150,255,.46); background: rgba(54,119,239,.12); }
        .google-sync-control:disabled { cursor: wait; opacity: .8; }
        @media (max-width: 1120px) { .system-status { display: none; } }
        @media (max-width: 820px) { .google-sync-control { min-width: 42px; width: 42px; justify-content: center; padding: 0; } .google-sync-control > div { display: none; } }
        @media (max-width: 560px) { .google-sync-control { display: none; } }
        /* @section: flexoimpress-brand-logo */
        .brand-lockup .brand-identity img.brand-logo {
          width: min(100%, 192px);
          height: auto;
          max-height: 76px;
          object-fit: contain;
          object-position: left center;
          filter: drop-shadow(0 2px 6px rgba(0,0,0,.55));
        }
        @media (max-width: 720px) {
          .brand-lockup .brand-identity img.brand-logo { width: 166px; max-height: 61px; }
        }
      `}</style>
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
            {/* @section: inventory-protection-status */}
            <div className="system-status" aria-label="Control de inventario protegido">
              <ShieldCheck size={17} />
              <div><span>Control activo</span><strong>Stock protegido</strong></div>
            </div>
            {/* @section: google-sync-control */}
            <button
              className={`google-sync-control ${googleTone}`}
              type="button"
              onClick={() => googleSyncMutation.mutate()}
              disabled={googleSyncMutation.isPending}
              title={googleStatus?.message ?? "Sincronizar la instantánea actual con Google Sheets y Docs"}
              aria-label="Sincronizar ahora con Google Sheets y Google Docs"
            >
              {googleSyncMutation.isPending ? <RefreshCw size={16} className="spin" /> : googleTone === "ready" ? <ShieldCheck size={16} /> : <WifiOff size={16} />}
              <div><span>Google Workspace</span><strong>{googleLabel}</strong></div>
            </button>
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
            <OperationForm kind="PRODUCCION" items={data.inventory} businessDate={businessDate} operators={data.registeredOperators} />
          )}
          {data && view === "operators" && <OperatorsView data={data} onNavigate={setView} />}
          {data && view === "dispatch" && (
            <DispatchForm items={data.inventory} businessDate={businessDate} operators={data.registeredOperators} />
          )}
          {data && view === "clients" && <ClientsView products={data.inventory} />}
          {data && view === "movements" && <MovementsView movements={data.movements} operators={data.registeredOperators} />}
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
        {/* @section: flexoimpress-brand */}
        <div className="brand-lockup">
          <div className="brand-identity">
            <img className="brand-logo" src="/brand/flexoimpress-logo-gold.png" alt="Flexoimpress — Seguridad, calidad y confianza" />
            <span>Control operativo ERP</span>
          </div>
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
          <button className="quick-action operators" type="button" onClick={() => onNavigate("operators")}>
            <span className="quick-icon"><Users size={23} /></span>
            <span><strong>Ver operarios</strong><small>Revisar producción, salidas y balance</small></span>
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
function OperationForm({
  kind,
  items,
  businessDate,
  operators = []
}: {
  kind: OperationKind;
  items: InventoryItem[];
  businessDate: string;
  operators?: string[];
}) {
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
          operator,
          bagQuantity: kind === "PRODUCCION" ? Number(bagQuantity || 0) : 0,
          operationDate,
          notes: notes || undefined
        })
      });
      const payload = (await response.json()) as ApiEnvelope<{ operationId: string; googleSync: GoogleSyncResult }>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "No se pudo registrar la operación." : payload.error.message);
      }
      return payload.data;
    },
    onSuccess: async (result) => {
      const operationMessage = kind === "PRODUCCION" ? "Producción registrada y stock actualizado." : "Despacho registrado y stock actualizado.";
      if (result.googleSync.ok) {
        toast.success(operationMessage, { description: result.googleSync.message });
      } else {
        toast.warning(operationMessage, { description: result.googleSync.message });
      }
      setQuantity("");
      setBagQuantity("0");
      setNotes("");
      setOperator("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["erp-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["google-sync-status"] })
      ]);
    },
    onError: (error) => toast.error(error.message)
  });

  const newStock = selectedItem
    ? kind === "PRODUCCION"
      ? selectedItem.stock + (Number(quantity) || 0)
      : selectedItem.stock - (Number(quantity) || 0)
    : 0;
  const canSubmit = Boolean(productId && variantId && Number(quantity) > 0 && operationDate && operator.trim());

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
            <label className="field">
              <span>Operario responsable *</span>
              <input
                list={`registered-operators-${kind.toLowerCase()}`}
                value={operator}
                onChange={(event) => setOperator(event.target.value)}
                placeholder="Selecciona o escribe un nombre"
              />
              <datalist id={`registered-operators-${kind.toLowerCase()}`}>
                {operators.map((name) => <option key={name} value={name} />)}
              </datalist>
              <small className="field-hint">Se atribuirán a este operario todos los movimientos generados por la operación.</small>
            </label>
            {kind === "PRODUCCION" && selectedItem?.bagType && (
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
          {kind === "PRODUCCION" && Number(bagQuantity) > 0 && selectedItem?.bagType && <div className="bag-note"><PackageCheck size={17} /><span>Se descontarán automáticamente {formatNumber(Number(bagQuantity))} Bolsas de {selectedItem.bagType === "ALTA" ? "Alta" : "Baja"} y quedarán atribuidas al mismo operario.</span></div>}
        </article>
        <article className="integrity-card"><ShieldCheck size={22} /><div><strong>Control de integridad</strong><span>No se permite stock negativo y cada cambio queda registrado.</span></div></article>
      </aside>
    </div>
  );
}

/* @section: dispatch-multiline-form */
type DispatchLine = { id: string; variantId: string; quantity: string };

function DispatchForm({
  items,
  businessDate,
  operators = []
}: {
  items: InventoryItem[];
  businessDate: string;
  operators?: string[];
}) {
  const queryClient = useQueryClient();
  const productGroups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    items.forEach((item) => map.set(item.productId, [...(map.get(item.productId) ?? []), item]));
    return Array.from(map.values());
  }, [items]);

  const makeLine = (): DispatchLine => ({ id: crypto.randomUUID(), variantId: items[0]?.id ?? "", quantity: "" });

  const [ruc, setRuc] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [operationDate, setOperationDate] = useState(businessDate);
  const [operator, setOperator] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DispatchLine[]>(() => [makeLine()]);

  useEffect(() => {
    setOperationDate(businessDate);
  }, [businessDate]);

  const rucDigits = ruc.trim();
  const rucValid = /^\d{8,11}$/.test(rucDigits);

  const lookupQuery = useQuery({
    queryKey: ["client-lookup", rucDigits],
    queryFn: () => fetchClientLookup(rucDigits),
    enabled: rucValid,
    staleTime: 10_000
  });

  const clientFound = Boolean(rucValid && lookupQuery.data?.found && lookupQuery.data.client);

  useEffect(() => {
    if (clientFound && lookupQuery.data?.client) {
      setBusinessName(lookupQuery.data.client.businessName);
    }
  }, [clientFound, lookupQuery.data]);

  function updateLine(id: string, patch: Partial<DispatchLine>) {
    setLines((previous) => previous.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((previous) => [...previous, makeLine()]);
  }

  function removeLine(id: string) {
    setLines((previous) => (previous.length > 1 ? previous.filter((line) => line.id !== id) : previous));
  }

  const requestedByVariant = useMemo(() => {
    const totals = new Map<string, number>();
    lines.forEach((line) => {
      const quantity = Number(line.quantity) || 0;
      if (!line.variantId || quantity <= 0) return;
      totals.set(line.variantId, (totals.get(line.variantId) ?? 0) + quantity);
    });
    return totals;
  }, [lines]);

  const exceededVariantIds = useMemo(() => {
    const bad = new Set<string>();
    requestedByVariant.forEach((quantity, variantId) => {
      const item = items.find((entry) => entry.id === variantId);
      if (item && quantity > item.stock) bad.add(variantId);
    });
    return bad;
  }, [requestedByVariant, items]);

  const totalUnits = Array.from(requestedByVariant.values()).reduce((sum, quantity) => sum + quantity, 0);
  const canSubmit =
    rucValid &&
    (clientFound || businessName.trim().length >= 3) &&
    Boolean(operationDate) &&
    Boolean(operator.trim()) &&
    lines.every((line) => line.variantId && Number(line.quantity) > 0) &&
    exceededVariantIds.size === 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/erp/dispatches", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruc: rucDigits,
          businessName: clientFound ? undefined : businessName.trim(),
          operationDate,
          operator,
          notes: notes || undefined,
          items: lines.map((line) => {
            const item = items.find((entry) => entry.id === line.variantId);
            return { productId: item?.productId ?? "", variantId: line.variantId, quantity: Number(line.quantity) };
          })
        })
      });
      const payload = (await response.json()) as ApiEnvelope<{ dispatchId: string; googleSync: GoogleSyncResult }>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "No se pudo registrar el despacho." : payload.error.message);
      }
      return payload.data;
    },
    onSuccess: async (result) => {
      if (result.googleSync.ok) {
        toast.success("Despacho registrado y stock actualizado.", { description: result.googleSync.message });
      } else {
        toast.warning("Despacho registrado y stock actualizado.", { description: result.googleSync.message });
      }
      setRuc("");
      setBusinessName("");
      setOperator("");
      setNotes("");
      setLines([makeLine()]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["erp-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["google-sync-status"] }),
        queryClient.invalidateQueries({ queryKey: ["clients-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["client-summary"] })
      ]);
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <div className="operation-layout dispatch-layout animate-in">
      <section className="panel form-panel">
        <div className="panel-heading form-heading">
          <div><p className="section-kicker">SALIDA DE INVENTARIO</p><h2>Datos del despacho</h2></div>
          <span className="operation-kind out"><ArrowDownRight size={16} /> DESPACHO</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
          className="erp-form"
        >
          <div className="form-grid">
            <label className="field">
              <span>RUC *</span>
              <input
                value={ruc}
                onChange={(event) => setRuc(event.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
                placeholder="20123456789"
                inputMode="numeric"
              />
              {rucDigits.length > 0 && !rucValid && <small className="field-hint field-error">El RUC debe tener entre 8 y 11 dígitos.</small>}
              {rucValid && lookupQuery.isFetching && <small className="field-hint">Buscando cliente…</small>}
            </label>
            <label className="field">
              <span>Razón social / Cliente {clientFound ? "" : "*"}</span>
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                disabled={clientFound}
                placeholder={rucValid ? "Escribe la razón social" : "Ingresa un RUC válido primero"}
              />
              {clientFound && <small className="field-hint">Cliente existente: se reutilizará sin duplicar.</small>}
              {rucValid && lookupQuery.data && !lookupQuery.data.found && (
                <small className="field-hint">RUC nuevo: se creará este cliente al guardar el despacho.</small>
              )}
            </label>
            <label className="field">
              <span>Fecha *</span>
              <input type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} />
            </label>
            <label className="field">
              <span>Operario responsable *</span>
              <input
                list="registered-operators-dispatch"
                value={operator}
                onChange={(event) => setOperator(event.target.value)}
                placeholder="Selecciona o escribe un nombre"
              />
              <datalist id="registered-operators-dispatch">
                {operators.map((name) => <option key={name} value={name} />)}
              </datalist>
            </label>
            <label className="field field-wide">
              <span>Observaciones</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} placeholder="Información adicional (opcional)" />
            </label>
          </div>

          <div className="dispatch-lines-section">
            <div className="dispatch-lines-heading">
              <p className="section-kicker">DETALLE DEL DESPACHO</p>
              <button type="button" className="add-line-button" onClick={addLine}><Plus size={16} /> Agregar producto</button>
            </div>
            <div className="table-scroll">
              <table className="data-table dispatch-lines-table">
                <thead>
                  <tr>
                    <th>Item</th><th>Cantidad</th><th>Unidad</th><th>Código</th><th>Descripción</th><th>Color</th><th>Stock disponible</th><th>Eliminar</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const selected = items.find((entry) => entry.id === line.variantId);
                    const exceeded = exceededVariantIds.has(line.variantId);
                    return (
                      <tr key={line.id} className={exceeded ? "line-exceeded" : ""}>
                        <td data-label="Item">{index + 1}</td>
                        <td data-label="Cantidad">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td data-label="Unidad">Unidad</td>
                        <td data-label="Código">
                          <select value={line.variantId} onChange={(event) => updateLine(line.id, { variantId: event.target.value })}>
                            {productGroups.map((group) => (
                              <optgroup key={group[0].productId} label={group[0].productName}>
                                {group.map((variant) => (
                                  <option key={variant.id} value={variant.id}>
                                    {variant.sku}{variant.color ? ` · ${variant.color}` : ""}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                        <td data-label="Descripción">{selected?.productName ?? "—"}</td>
                        <td data-label="Color">
                          {selected?.color ? (
                            <span className="line-color">
                              <span className={`color-dot color-${selected.color.toLowerCase().replace("ó", "o")}`} />
                              {selected.color}
                            </span>
                          ) : "—"}
                        </td>
                        <td data-label="Stock disponible"><strong className={`stock-number ${exceeded ? "negative" : ""}`}>{formatNumber(selected?.stock ?? 0)}</strong></td>
                        <td data-label="Eliminar">
                          <button type="button" className="icon-button" onClick={() => removeLine(line.id)} disabled={lines.length === 1} aria-label="Eliminar línea">
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {exceededVariantIds.size > 0 && (
              <div className="inline-warning">
                <AlertTriangle size={17} />
                <span>Alguna variante supera el stock disponible sumando todas sus líneas. Ajusta las cantidades antes de guardar.</span>
              </div>
            )}
          </div>

          <div className="form-footer">
            <p><ShieldCheck size={16} /> Despacho transaccional: todo o nada, con inventario y cliente actualizados juntos.</p>
            <button className="primary-button" type="submit" disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? <><RefreshCw size={17} className="spin" /> Procesando…</> : <><Truck size={18} /> Registrar despacho</>}
            </button>
          </div>
        </form>
      </section>

      <aside className="operation-summary">
        <article className="panel stock-preview">
          <p className="section-kicker">VISTA PREVIA</p>
          <div className="dispatch-summary-rows">
            <div><span>Líneas</span><strong>{lines.length}</strong></div>
            <div><span>Unidades totales</span><strong>{formatNumber(totalUnits)}</strong></div>
            <div><span>Cliente</span><strong>{businessName || "—"}</strong></div>
          </div>
        </article>
        <article className="integrity-card"><ShieldCheck size={22} /><div><strong>Control de integridad</strong><span>No se permite stock negativo; el despacho completo se guarda o se rechaza como una sola transacción.</span></div></article>
      </aside>
    </div>
  );
}

/* @section: clients-view */
function ClientsView({ products }: { products: InventoryItem[] }) {
  const [filters, setFilters] = useState<ClientFiltersState>({ ruc: "", client: "", dateFrom: "", dateTo: "", productId: "", color: "" });
  const [selectedRuc, setSelectedRuc] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ["clients-dashboard", filters],
    queryFn: () => fetchClientsDashboard(filters),
    staleTime: 5_000
  });

  const summaryQuery = useQuery({
    queryKey: ["client-summary", selectedRuc, filters.dateFrom, filters.dateTo, filters.productId, filters.color],
    queryFn: () => fetchClientSummary(selectedRuc as string, filters),
    enabled: Boolean(selectedRuc)
  });

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((item) => map.set(item.productId, item.productName));
    return Array.from(map.entries());
  }, [products]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((item) => {
      if (item.color) set.add(item.color);
    });
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  function toISO(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }

  function applyQuickRange(range: "today" | "week" | "month" | "year") {
    const now = new Date();
    let from = new Date(now);
    if (range === "week") {
      from = new Date(now);
      from.setDate(now.getDate() - now.getDay());
    } else if (range === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === "year") {
      from = new Date(now.getFullYear(), 0, 1);
    }
    setFilters((previous) => ({ ...previous, dateFrom: toISO(from), dateTo: toISO(now) }));
  }

  function clearFilters() {
    setFilters({ ruc: "", client: "", dateFrom: "", dateTo: "", productId: "", color: "" });
  }

  const data = dashboardQuery.data;

  return (
    <div className="view-stack animate-in">
      <section className="operator-metric-grid" aria-label="Indicadores de clientes">
        <OperatorMetric icon={Building2} label="Total de clientes" value={data?.overview.totalClients ?? 0} detail="con despachos registrados" />
        <OperatorMetric icon={Truck} label="Total de despachos" value={data?.overview.totalDispatches ?? 0} detail="despachos multilínea" />
        <OperatorMetric icon={Boxes} label="Total de unidades" value={data?.overview.totalUnits ?? 0} detail="unidades despachadas" />
        <OperatorMetric
          icon={Trophy}
          label="Mejor cliente"
          value={data?.overview.bestClient ? data.overview.bestClient.businessName : "Sin registros"}
          detail={data?.overview.bestClient ? `${formatNumber(data.overview.bestClient.totalUnits)} unidades` : "según los filtros aplicados"}
          textValue
        />
      </section>

      <section className="panel client-filters-panel">
        <div className="panel-heading"><div><p className="section-kicker">FILTROS</p><h2>Buscar y filtrar clientes</h2></div></div>
        <div className="form-grid">
          <label className="field"><span>RUC</span><input value={filters.ruc} onChange={(event) => setFilters((previous) => ({ ...previous, ruc: event.target.value }))} placeholder="RUC exacto" /></label>
          <label className="field"><span>Cliente</span><input value={filters.client} onChange={(event) => setFilters((previous) => ({ ...previous, client: event.target.value }))} placeholder="Razón social" /></label>
          <label className="field"><span>Fecha desde</span><input type="date" value={filters.dateFrom} onChange={(event) => setFilters((previous) => ({ ...previous, dateFrom: event.target.value }))} /></label>
          <label className="field"><span>Fecha hasta</span><input type="date" value={filters.dateTo} onChange={(event) => setFilters((previous) => ({ ...previous, dateTo: event.target.value }))} /></label>
          <label className="field">
            <span>Producto</span>
            <select value={filters.productId} onChange={(event) => setFilters((previous) => ({ ...previous, productId: event.target.value }))}>
              <option value="">Todos</option>
              {productOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Color</span>
            <select value={filters.color} onChange={(event) => setFilters((previous) => ({ ...previous, color: event.target.value }))}>
              <option value="">Todos</option>
              {colorOptions.map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
          </label>
        </div>
        <div className="filter-tabs quick-range-tabs" role="group" aria-label="Rangos rápidos">
          <button type="button" onClick={() => applyQuickRange("today")}>Hoy</button>
          <button type="button" onClick={() => applyQuickRange("week")}>Esta semana</button>
          <button type="button" onClick={() => applyQuickRange("month")}>Este mes</button>
          <button type="button" onClick={() => applyQuickRange("year")}>Este año</button>
          <button type="button" onClick={clearFilters}>Limpiar</button>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="section-kicker">RANKING</p><h2>Clientes por unidades despachadas</h2></div></div>
        {dashboardQuery.isLoading ? (
          <LoadingState />
        ) : dashboardQuery.isError ? (
          <ErrorState message={(dashboardQuery.error as Error).message} onRetry={() => dashboardQuery.refetch()} />
        ) : !data || data.ranking.length === 0 ? (
          <EmptyPanel title="Sin despachos registrados" text="Los despachos multilínea con cliente aparecerán aquí." />
        ) : (
          <div className="table-scroll">
            <table className="data-table clients-table">
              <thead><tr><th>Ranking</th><th>Cliente</th><th>RUC</th><th>Despachos</th><th>Unidades</th><th>Último despacho</th></tr></thead>
              <tbody>
                {data.ranking.map((row) => (
                  <tr
                    key={row.clientId}
                    className={selectedRuc === row.ruc ? "row-selected" : ""}
                    onClick={() => setSelectedRuc(row.ruc)}
                  >
                    <td data-label="Ranking">#{row.rank}</td>
                    <td data-label="Cliente"><strong>{row.businessName}</strong></td>
                    <td data-label="RUC"><code>{row.ruc}</code></td>
                    <td data-label="Despachos">{formatNumber(row.dispatchCount)}</td>
                    <td data-label="Unidades"><strong className="stock-number">{formatNumber(row.totalUnits)}</strong></td>
                    <td data-label="Último despacho">{row.lastDispatchAt ? formatDateOnly(row.lastDispatchAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRuc && (
        <section className="panel client-detail-panel">
          <div className="panel-heading">
            <div><p className="section-kicker">CONSULTA INDIVIDUAL</p><h2>Detalle por RUC {selectedRuc}</h2></div>
            <button className="text-button" type="button" onClick={() => setSelectedRuc(null)}>Cerrar</button>
          </div>
          {summaryQuery.isLoading ? (
            <LoadingState />
          ) : summaryQuery.data ? (
            <>
              <div className="client-detail-head">
                <div><span>Cliente</span><strong>{summaryQuery.data.client.businessName}</strong></div>
                <div><span>RUC</span><strong>{summaryQuery.data.client.ruc}</strong></div>
                <div><span>Total despachos</span><strong>{formatNumber(summaryQuery.data.dispatchCount)}</strong></div>
                <div><span>Total unidades</span><strong>{formatNumber(summaryQuery.data.totalUnits)}</strong></div>
                <div><span>Último despacho</span><strong>{summaryQuery.data.lastDispatchAt ? formatDateOnly(summaryQuery.data.lastDispatchAt) : "—"}</strong></div>
              </div>
              <h3 className="client-products-title">Productos comprados</h3>
              {summaryQuery.data.products.length === 0 ? (
                <EmptyPanel title="Sin productos" text="Este cliente no tiene productos que coincidan con los filtros." />
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Producto</th><th>Color</th><th>Cantidad</th></tr></thead>
                    <tbody>
                      {summaryQuery.data.products.map((row, index) => (
                        <tr key={index}>
                          <td data-label="Producto">{row.productName}</td>
                          <td data-label="Color">{row.color ?? "—"}</td>
                          <td data-label="Cantidad"><strong className="stock-number">{formatNumber(row.quantity)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <EmptyPanel title="Sin información" text="No se encontraron datos para este RUC." />
          )}
        </section>
      )}
    </div>
  );
}

/* @section: operators-activity-monitor */
function OperatorsView({ data, onNavigate }: { data: Snapshot; onNavigate: (view: View) => void }) {
  const [search, setSearch] = useState("");
  const filtered = data.operators.filter((operator) => operator.name.toLowerCase().includes(search.toLowerCase()));
  const maxUnits = Math.max(...data.operators.map((operator) => operator.units), 1);

  return (
    <div className="view-stack animate-in operators-view">
      <section className="operator-metric-grid" aria-label="Indicadores de actividad de operarios">
        <OperatorMetric icon={Users} label="Operarios activos" value={data.operatorDashboard.activeCount} detail="con movimientos en la fecha" />
        <OperatorMetric icon={Factory} label="Producción registrada" value={data.operatorDashboard.totalUnits} detail="unidades producidas" />
        <OperatorMetric icon={Truck} label="Despachos registrados" value={data.operatorDashboard.totalDispatchUnits} detail="unidades retiradas" />
        <OperatorMetric icon={PackageCheck} label="Bolsas consumidas" value={data.operatorDashboard.totalBagConsumptionUnits} detail="salidas automáticas" />
        <OperatorMetric icon={Target} label="Promedio por operario" value={data.operatorDashboard.averagePerOperator} detail="unidades producidas" />
        <OperatorMetric icon={Trophy} label="Mayor producción" value={data.operatorDashboard.bestOperator ?? "Sin registros"} detail="según la fecha operativa" textValue />
      </section>

      <section className="toolbar-panel operator-toolbar">
        <label className="search-control"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar información por operario" /></label>
        <div className="operator-date-context"><span>Seguimiento del</span><strong>{new Intl.DateTimeFormat("es-PE", { dateStyle: "long" }).format(new Date(`${data.date}T12:00:00`))}</strong></div>
        <button className="primary-button" type="button" onClick={() => onNavigate("production")}><Factory size={17} /> Registrar producción</button>
      </section>

      {filtered.length === 0 ? (
        <section className="panel operator-empty">
          <UserRound size={32} />
          <h2>{search ? "No encontramos ese operario" : "Aún no hay actividad registrada"}</h2>
          <p>{search ? "Prueba con otro nombre o limpia la búsqueda." : "Los operarios aparecerán aquí cuando registres una producción o un despacho para esta fecha."}</p>
          {!search && <button className="primary-button" type="button" onClick={() => onNavigate("production")}><Factory size={17} /> Registrar primera producción</button>}
        </section>
      ) : (
        <section className="operator-grid" aria-live="polite">
          {filtered.map((operator) => {
            const isLeader = operator.name === data.operatorDashboard.bestOperator && operator.units > 0;
            return (
              <article className="panel operator-card" key={operator.name}>
                <div className="operator-card-head">
                  <div className="operator-avatar">{operator.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
                  <div className="operator-name"><span>Responsable de operación</span><h2>{operator.name}</h2></div>
                  <span className={`operator-rank ${isLeader ? "leader" : ""}`}>{isLeader ? <><Trophy size={14} /> Mayor producción</> : `${operator.share}% de producción`}</span>
                </div>

                <div className="operator-output">
                  <div><span>Balance producción − salidas</span><strong className={operator.balance >= 0 ? "positive" : "negative"}>{operator.balance >= 0 ? "+" : ""}{formatNumber(operator.balance)}</strong></div>
                  <div className="operator-progress" aria-label={`${operator.share}% de la producción total`}><span style={{ width: `${operator.units === 0 ? 0 : Math.max(4, Math.round((operator.units / maxUnits) * 100))}%` }} /></div>
                </div>

                <div className="operator-stats">
                  <div><span>Producción</span><strong className="positive">+{formatNumber(operator.units)}</strong></div>
                  <div><span>Despachos</span><strong className="negative">−{formatNumber(operator.dispatchUnits)}</strong></div>
                  <div><span>Consumo bolsas</span><strong className="negative">−{formatNumber(operator.bagConsumptionUnits)}</strong></div>
                  <div><span>Reg. producción</span><strong>{formatNumber(operator.records)}</strong></div>
                  <div><span>Reg. salidas</span><strong>{formatNumber(operator.dispatchRecords + operator.bagConsumptionRecords)}</strong></div>
                  <div><span>Promedio</span><strong>{formatNumber(operator.averagePerRecord)} u.</strong></div>
                </div>

                <div className="operator-history">
                  <div className="operator-history-title"><span>Actividad reciente</span><small>{formatDateTime(operator.lastActivityAt)}</small></div>
                  {operator.activity.slice(0, 5).map((record) => (
                    <div className="operator-production-row" key={record.id}>
                      <span className={`production-dot ${record.type === "SALIDA" ? "output-dot" : ""}`} />
                      <div><strong>{record.productName}</strong><small>{record.reason.replace("_", " ")} · {record.color ?? "Presentación estándar"} · {formatDateTime(record.occurredAt)}</small></div>
                      <strong className={record.type === "ENTRADA" ? "positive" : "negative"}>{record.type === "ENTRADA" ? "+" : "−"}{formatNumber(record.quantity)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function OperatorMetric({
  icon: Icon,
  label,
  value,
  detail,
  textValue = false
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  detail: string;
  textValue?: boolean;
}) {
  return (
    <article className="operator-metric">
      <span className="operator-metric-icon"><Icon size={20} /></span>
      <div><span>{label}</span><strong className={textValue ? "text-value" : ""}>{typeof value === "number" ? formatNumber(value) : value}</strong><small>{detail}</small></div>
    </article>
  );
}

/* @section: movements-view */
function MovementsView({ movements, operators }: { movements: Movement[]; operators: string[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"ALL" | "ENTRADA" | "SALIDA">("ALL");
  const [operator, setOperator] = useState("ALL");
  const operatorOptions = useMemo(() => {
    const names = new Map<string, string>();
    [...operators, ...movements.map((movement) => movement.operator).filter((name): name is string => Boolean(name))].forEach((name) => {
      const trimmed = name.trim();
      if (trimmed) names.set(trimmed.toLocaleLowerCase("es"), trimmed);
    });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, "es"));
  }, [movements, operators]);
  const filtered = movements.filter((movement) => {
    const matchesType = type === "ALL" || movement.type === type;
    const matchesOperator = operator === "ALL" || movement.operator?.trim().toLocaleLowerCase("es") === operator;
    const haystack = `${movement.productName} ${movement.color ?? ""} ${movement.operator ?? ""} ${movement.reason}`.toLowerCase();
    return matchesType && matchesOperator && haystack.includes(search.toLowerCase());
  });

  return (
    <div className="view-stack animate-in">
      {/* @section: movements-operator-filter */}
      <section className="toolbar-panel movements-toolbar">
        <label className="search-control"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en movimientos" /></label>
        <label className="operator-filter-control">
          <span>Operario</span>
          <select value={operator} onChange={(event) => setOperator(event.target.value)} aria-label="Filtrar movimientos por operario">
            <option value="ALL">Todos los operarios</option>
            {operatorOptions.map((name) => <option key={name} value={name.toLocaleLowerCase("es")}>{name}</option>)}
          </select>
        </label>
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
