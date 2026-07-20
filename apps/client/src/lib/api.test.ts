// Unit tests for the third-party Google sign-in client entry points in
// lib/api.ts — the ONLY production Google login path (see AGENTS.md Hard
// Boundaries):
//
//   startThirdPartyGoogleAuth()  → asks the backend for the gateway auth_url
//                                  and navigates the browser there
//   syncAuthTokenFromUrl()       → on landing, verifies login_token/ts/sig,
//                                  stores the bearer token, scrubs the URL
//
// The backend is mocked at the global-fetch boundary; token storage and URL
// handling run for real against happy-dom.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startThirdPartyGoogleAuth, syncAuthTokenFromUrl } from "@/lib/api";
import { clearAuthToken, getAuthToken } from "@/lib/auth";

vi.mock("@/lib/api-error", () => ({
  notifyApiError: vi.fn(async () => undefined)
}));

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  clearAuthToken();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncAuthTokenFromUrl", () => {
  it("verifies the signed params, stores the token, and scrubs the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/admin?login_token=tok-1&ts=1700000000000&sig=abc&keep=me"
    );
    const mock = stubFetch(200, { ok: true, data: { ok: true } });

    await expect(syncAuthTokenFromUrl()).resolves.toBe(true);

    // Verify call carries the exact landing path + signed triple.
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/third-party-google-auth/verify");
    expect(JSON.parse(String(init.body))).toEqual({
      path: "/admin",
      token: "tok-1",
      ts: "1700000000000",
      sig: "abc"
    });

    expect(getAuthToken()).toBe("tok-1");

    // login_token/ts/sig are removed; unrelated params survive.
    const search = new URLSearchParams(window.location.search);
    expect(search.get("login_token")).toBeNull();
    expect(search.get("ts")).toBeNull();
    expect(search.get("sig")).toBeNull();
    expect(search.get("keep")).toBe("me");
    expect(window.location.pathname).toBe("/admin");
  });

  it("does not store a token when verification fails", async () => {
    window.history.replaceState(null, "", "/admin?login_token=tok-x&ts=1&sig=forged");
    stubFetch(401, { ok: false, error: { code: "INVALID_LOGIN_TOKEN", message: "Invalid" } });

    await expect(syncAuthTokenFromUrl()).resolves.toBe(false);
    expect(getAuthToken()).toBe("");
  });

  it("returns false without calling the backend when the params are absent", async () => {
    window.history.replaceState(null, "", "/admin?foo=bar");
    const mock = stubFetch(200, { ok: true, data: { ok: true } });

    await expect(syncAuthTokenFromUrl()).resolves.toBe(false);
    expect(mock).not.toHaveBeenCalled();
    expect(getAuthToken()).toBe("");
  });
});

describe("startThirdPartyGoogleAuth", () => {
  it("posts origin + landing path to /start and navigates to the gateway auth_url", async () => {
    const mock = stubFetch(200, {
      ok: true,
      data: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=st-1" }
    });
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    await startThirdPartyGoogleAuth("/admin");

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/third-party-google-auth/start");
    expect(JSON.parse(String(init.body))).toEqual({
      origin: window.location.origin,
      landing_path: "/admin"
    });
    expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=st-1");
  });

  it("throws (and does not navigate) when the backend cannot provide an auth_url", async () => {
    stubFetch(503, {
      ok: false,
      error: { code: "THIRD_PARTY_GOOGLE_AUTH_CONFIG_MISSING", message: "missing" }
    });
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    await expect(startThirdPartyGoogleAuth("/admin")).rejects.toThrow(
      "Third-party Google auth start failed"
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
