import { apiUrl } from "@/lib/api-base";
import { notifyApiError } from "@/lib/api-error";
import { getAuthToken, setAuthToken } from "@/lib/auth";

export type ApiFetchInit = RequestInit & {
  auth?: boolean;
};

export async function apiFetch(path: string, init?: ApiFetchInit) {
  const { auth = true, ...requestInit } = init ?? {};
  const token = auth ? getAuthToken() : "";

  const response = await fetch(apiUrl(path), {
    ...requestInit,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...requestInit.headers
    }
  });

  if (!response.ok) {
    await notifyApiError(response);
  }

  return response;
}

export async function startThirdPartyGoogleAuth(landingPath = window.location.pathname) {
  const response = await apiFetch("/third-party-google-auth/start", {
    method: "POST",
    auth: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: window.location.origin,
      landing_path: landingPath
    })
  });
  const payload = (await response.json()) as {
    ok: boolean;
    data?: { authUrl?: string; auth_url?: string };
  };
  const authUrl = payload.data?.authUrl ?? payload.data?.auth_url;

  if (!response.ok || !authUrl) {
    throw new Error("Third-party Google auth start failed");
  }

  window.location.assign(authUrl);
}

export async function syncAuthTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("login_token");
  const ts = url.searchParams.get("ts");
  const sig = url.searchParams.get("sig");

  if (!token || !ts || !sig) {
    return false;
  }

  const response = await apiFetch("/third-party-google-auth/verify", {
    method: "POST",
    auth: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: url.pathname, token, ts, sig })
  }).catch(() => null);

  if (!response?.ok) {
    return false;
  }

  setAuthToken(token);
  url.searchParams.delete("login_token");
  url.searchParams.delete("ts");
  url.searchParams.delete("sig");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}
