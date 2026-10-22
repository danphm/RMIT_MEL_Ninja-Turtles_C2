"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import { useCallback, useEffect, useState } from "react";

/**
 * All API calls go through secureFetch, which attaches the Tide access token and a fresh DPoP
 * proof. A plain fetch with a Bearer header is rejected by the server (sender-constrained tokens).
 */
export function useApi() {
  const { secureFetch } = useTideCloak();
  return useCallback(
    async <T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T }> => {
      const { json, ...rest } = init;
      const res = await secureFetch(url, {
        ...rest,
        ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) } } : {}),
      });
      const type = res.headers.get("content-type") ?? "";
      const data = (type.includes("application/json") ? await res.json() : await res.text()) as T;
      return { ok: res.ok, status: res.status, data };
    },
    [secureFetch]
  );
}

/** Load JSON once authenticated; `reload()` refetches. */
export function useLoad<T>(url: string | null) {
  const api = useApi();
  const { authenticated } = useTideCloak();
  const [state, setState] = useState<{ loading: boolean; status: number; data: T | null; error: string | null }>({
    loading: true, status: 0, data: null, error: null,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!authenticated || !url) return;
    let alive = true;
    api<T & { error?: string }>(url).then(
      (r) => alive && setState({ loading: false, status: r.status, data: r.ok ? r.data : null, error: r.ok ? null : (r.data as { error?: string })?.error ?? `Request failed (${r.status})` }),
      (e) => alive && setState({ loading: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) })
    );
    return () => {
      alive = false;
    };
  }, [api, authenticated, url, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Download a protected file: fetched with DPoP, then handed to the browser as a blob. */
export function useDownload() {
  const { secureFetch } = useTideCloak();
  return useCallback(
    async (url: string, fallbackName: string) => {
      const res = await secureFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Download refused (${res.status})`);
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = match?.[1] ?? fallbackName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    [secureFetch]
  );
}
