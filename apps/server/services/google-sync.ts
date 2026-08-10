/* @section: google-workspace-sync-client */
const GOOGLE_SYNC_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyS7coLUMf_sLbecuWE2IMR4yluQunbpOcplBstj9LLsRCxDHW9JvhB8osp6dl_voWR3Q/exec";
const GOOGLE_SYNC_TIMEOUT_MS = 25_000;

export type GoogleSyncResult = {
  ok: boolean;
  configured: boolean;
  skipped?: boolean;
  syncedAt?: string;
  message: string;
};

export type GoogleSyncStatus = {
  configured: boolean;
  reachable: boolean;
  lastSyncAt?: string;
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
    const response = await fetch(GOOGLE_SYNC_WEB_APP_URL, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(GOOGLE_SYNC_TIMEOUT_MS)
    });
    const upstream = safeGoogleMessage(await response.json().catch(() => null));
    if (!response.ok || !upstream?.ok) {
      return {
        configured: true,
        reachable: false,
        message: "Google no está disponible en este momento."
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
    console.error("Google Workspace status request failed", error);
    return {
      configured: true,
      reachable: false,
      message: "Google no respondió a la comprobación de estado."
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
    const response = await fetch(GOOGLE_SYNC_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret }),
      redirect: "follow",
      signal: AbortSignal.timeout(GOOGLE_SYNC_TIMEOUT_MS)
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const upstream = safeGoogleMessage(parsed);

    if (!response.ok || !upstream?.ok) {
      console.error("Google Workspace sync failed", {
        status: response.status,
        message: upstream?.errorMessage ?? "Respuesta no válida del servicio de Google."
      });
      return {
        ok: false,
        configured: true,
        message: "Google no pudo actualizarse; la operación del ERP permanece confirmada."
      };
    }

    return {
      ok: true,
      configured: true,
      syncedAt: upstream.syncedAt ?? payload.syncedAt,
      message: "Google Sheets y Google Docs se actualizaron correctamente."
    };
  } catch (error) {
    console.error("Google Workspace sync request failed", error);
    return {
      ok: false,
      configured: true,
      message: "Google no respondió; la operación del ERP permanece confirmada."
    };
  }
}
