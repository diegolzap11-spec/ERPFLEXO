/* @section: google-workspace-sync-client */
const GOOGLE_SYNC_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyS7coLUMf_sLbecuWE2IMR4yluQunbpOcplBstj9LLsRCxDHW9JvhB8osp6dl_voWR3Q/exec";
const GOOGLE_SYNC_TIMEOUT_MS = 25_000;

/* @section: google-workspace-safe-diagnostics */
export type GoogleSyncDiagnosticCode =
  | "TIMEOUT"
  | "DNS"
  | "TLS"
  | "CONNECTION"
  | "NETWORK_POLICY"
  | "REDIRECT"
  | "FETCH_UNAVAILABLE"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "UPSTREAM_REJECTED"
  | "UNKNOWN";

function classifyGoogleConnectionError(error: unknown): GoogleSyncDiagnosticCode {
  const codes: string[] = [];
  const names: string[] = [];
  const messages: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (current instanceof Error) {
      names.push(current.name);
      messages.push(current.message);
    }
    if (typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") codes.push(record.code.toUpperCase());
    current = record.cause;
  }

  const text = `${names.join(" ")} ${messages.join(" ")}`.toLowerCase();
  const hasCode = (...expected: string[]) => expected.some((code) => codes.includes(code));

  if (hasCode("ABORT_ERR") || text.includes("aborterror") || text.includes("aborted")) return "TIMEOUT";
  if (hasCode("ENOTFOUND", "EAI_AGAIN", "ERR_DNS_NOT_FOUND") || text.includes("getaddrinfo")) return "DNS";
  if (
    codes.some((code) => code.startsWith("ERR_TLS_") || code.startsWith("CERT_") || code.includes("CERTIFICATE")) ||
    hasCode("UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT") ||
    text.includes("certificate") ||
    text.includes("tls")
  ) return "TLS";
  if (hasCode("ERR_FR_TOO_MANY_REDIRECTS") || text.includes("redirect")) return "REDIRECT";
  if (hasCode("EACCES", "EPERM", "ERR_ACCESS_DENIED") || text.includes("not allowed")) return "NETWORK_POLICY";
  if (
    hasCode(
      "ECONNREFUSED",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "UND_ERR_CONNECT"
    )
  ) return "CONNECTION";
  if (text.includes("fetchunavailableerror") || text.includes("fetch is not defined") || text.includes("fetch is not a function")) {
    return "FETCH_UNAVAILABLE";
  }
  if (text.includes("fetch failed") || text.includes("failed to fetch")) return "FETCH_FAILED";
  return "UNKNOWN";
}

function diagnosticMessage(code: GoogleSyncDiagnosticCode) {
  const labels: Record<GoogleSyncDiagnosticCode, string> = {
    TIMEOUT: "tiempo de espera agotado",
    DNS: "resolución DNS",
    TLS: "negociación TLS",
    CONNECTION: "conexión de red",
    NETWORK_POLICY: "política de salida del servidor",
    REDIRECT: "redirección HTTP",
    FETCH_UNAVAILABLE: "cliente HTTP no disponible",
    FETCH_FAILED: "solicitud HTTP rechazada por el runtime",
    HTTP_ERROR: "respuesta HTTP de error",
    INVALID_RESPONSE: "respuesta no válida",
    UPSTREAM_REJECTED: "solicitud rechazada por Google",
    UNKNOWN: "error de runtime no clasificado"
  };
  return labels[code];
}

/* @section: google-workspace-portable-timeout */
async function fetchGoogleWorkspace(url: string, init: RequestInit) {
  if (typeof globalThis.fetch !== "function") {
    const error = new Error("HTTP client unavailable");
    error.name = "FetchUnavailableError";
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SYNC_TIMEOUT_MS);
  try {
    return await globalThis.fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export type GoogleSyncResult = {
  ok: boolean;
  configured: boolean;
  skipped?: boolean;
  syncedAt?: string;
  diagnosticCode?: GoogleSyncDiagnosticCode;
  message: string;
};

export type GoogleSyncStatus = {
  configured: boolean;
  reachable: boolean;
  lastSyncAt?: string;
  diagnosticCode?: GoogleSyncDiagnosticCode;
  message: string;
};

export type GoogleSyncPayload = Record<string, unknown> & {
  syncedAt: string;
  sourceOperation: {
    operationId: string;
    kind: "PRODUCCION" | "DESPACHO";
  } | null;
};

function safeGoogleMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const envelope = value as {
    ok?: boolean;
    configured?: boolean;
    lastSyncAt?: string | null;
    data?: { syncedAt?: string };
    error?: { message?: string };
  };
  return {
    ok: envelope.ok === true,
    configured: envelope.configured === true,
    lastSyncAt: typeof envelope.lastSyncAt === "string" ? envelope.lastSyncAt : undefined,
    syncedAt: envelope.data?.syncedAt,
    errorMessage: envelope.error?.message
  };
}

/* @section: google-workspace-sync-status */
export async function getGoogleSyncStatus(): Promise<GoogleSyncStatus> {
  const secret = process.env.GOOGLE_SYNC_SECRET?.trim();
  if (!secret || !GOOGLE_SYNC_WEB_APP_URL) {
    return {
      configured: false,
      reachable: false,
      message: "La sincronización con Google no está configurada."
    };
  }

  // Las pruebas no deben contactar los archivos reales de Google.
  if (process.env.NODE_ENV === "test") {
    return {
      configured: true,
      reachable: true,
      message: "Comprobación externa omitida de forma segura durante las pruebas."
    };
  }

  try {
    const response = await fetchGoogleWorkspace(GOOGLE_SYNC_WEB_APP_URL, {
      method: "GET",
      redirect: "follow"
    });
    const parsed = await response.json().catch(() => null);
    const upstream = safeGoogleMessage(parsed);
    if (!response.ok) {
      return {
        configured: true,
        reachable: false,
        diagnosticCode: "HTTP_ERROR",
        message: "Google devolvió una respuesta HTTP de error (diagnóstico: HTTP_ERROR)."
      };
    }
    if (!upstream) {
      return {
        configured: true,
        reachable: false,
        diagnosticCode: "INVALID_RESPONSE",
        message: "Google devolvió una respuesta no válida (diagnóstico: INVALID_RESPONSE)."
      };
    }
    if (!upstream.ok) {
      return {
        configured: true,
        reachable: false,
        diagnosticCode: "UPSTREAM_REJECTED",
        message: "Google rechazó la comprobación de estado (diagnóstico: UPSTREAM_REJECTED)."
      };
    }
    return {
      configured: upstream.configured,
      reachable: true,
      lastSyncAt: upstream.lastSyncAt,
      message: upstream.configured
        ? "Google Sheets y Google Docs están conectados."
        : "Apps Script responde, pero su configuración no está completa."
    };
  } catch (error) {
    const diagnosticCode = classifyGoogleConnectionError(error);
    return {
      configured: true,
      reachable: false,
      diagnosticCode,
      message: `Google no respondió: ${diagnosticMessage(diagnosticCode)} (diagnóstico: ${diagnosticCode}).`
    };
  }
}

export async function postSnapshotToGoogle(payload: GoogleSyncPayload): Promise<GoogleSyncResult> {
  const secret = process.env.GOOGLE_SYNC_SECRET?.trim();
  if (!secret || !GOOGLE_SYNC_WEB_APP_URL) {
    return {
      ok: false,
      configured: false,
      message: "La sincronización con Google no está configurada."
    };
  }

  // Las pruebas nunca deben escribir en los archivos reales de Google.
  if (process.env.NODE_ENV === "test") {
    return {
      ok: true,
      configured: true,
      skipped: true,
      message: "Sincronización externa omitida de forma segura durante las pruebas."
    };
  }

  try {
    const response = await fetchGoogleWorkspace(GOOGLE_SYNC_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret }),
      redirect: "follow"
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const upstream = safeGoogleMessage(parsed);

    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        diagnosticCode: "HTTP_ERROR",
        message: "Google devolvió un error HTTP; la operación del ERP permanece confirmada."
      };
    }
    if (!upstream) {
      return {
        ok: false,
        configured: true,
        diagnosticCode: "INVALID_RESPONSE",
        message: "Google devolvió una respuesta no válida; la operación del ERP permanece confirmada."
      };
    }
    if (!upstream.ok) {
      return {
        ok: false,
        configured: true,
        diagnosticCode: "UPSTREAM_REJECTED",
        message: "Google rechazó la sincronización; la operación del ERP permanece confirmada."
      };
    }

    return {
      ok: true,
      configured: true,
      syncedAt: upstream.syncedAt ?? payload.syncedAt,
      message: "Google Sheets y Google Docs se actualizaron correctamente."
    };
  } catch (error) {
    const diagnosticCode = classifyGoogleConnectionError(error);
    return {
      ok: false,
      configured: true,
      diagnosticCode,
      message: `Google no respondió (${diagnosticMessage(diagnosticCode)}); la operación del ERP permanece confirmada.`
    };
  }
}
