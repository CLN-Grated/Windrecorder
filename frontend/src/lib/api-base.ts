/** Browser-only API base + Bearer token for split frontend/backend deploys. */

export const API_BASE_STORAGE_KEY = "wr_api_base"
export const WEBUI_TOKEN_STORAGE_KEY = "wr_webui_token"
export const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:54100"

function safeStorageGet(key: string): string {
  try {
    return localStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (!value) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore quota / private mode */
  }
}

/** Normalize user input to origin (no trailing slash). Empty string = same-origin relative. */
export function normalizeApiBase(input: string): string {
  const raw = (input || "").trim()
  if (!raw) return ""
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("API 地址必须是合法的 http(s) URL，例如 http://127.0.0.1:54100")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API 地址仅支持 http 或 https 协议。")
  }
  // Origin only: scheme + host + port
  return url.origin
}

export function getApiBase(): string {
  return safeStorageGet(API_BASE_STORAGE_KEY)
}

export function setApiBase(value: string): string {
  const normalized = normalizeApiBase(value)
  safeStorageSet(API_BASE_STORAGE_KEY, normalized)
  return normalized
}

export function clearApiBase(): void {
  safeStorageSet(API_BASE_STORAGE_KEY, "")
}

export function getWebuiToken(): string {
  return safeStorageGet(WEBUI_TOKEN_STORAGE_KEY)
}

export function setWebuiToken(token: string): void {
  safeStorageSet(WEBUI_TOKEN_STORAGE_KEY, (token || "").trim())
}

export function clearWebuiToken(): void {
  safeStorageSet(WEBUI_TOKEN_STORAGE_KEY, "")
}

/** Prefix path with API base. path must start with /. */
export function apiUrl(path: string): string {
  const base = getApiBase()
  const p = path.startsWith("/") ? path : `/${path}`
  return base ? `${base}${p}` : p
}

/**
 * Resolve media / asset URLs returned by API.
 * - data: and absolute http(s) unchanged
 * - /media/... prefixed with API base
 */
export function mediaUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return ""
  if (pathOrUrl.startsWith("data:") || pathOrUrl.startsWith("blob:")) return pathOrUrl
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return apiUrl(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`)
}

export function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  const token = getWebuiToken()
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  return headers
}

/** Fetch media with Bearer when token present; returns object URL (caller should revoke). */
export async function fetchMediaObjectUrl(pathOrUrl: string): Promise<string> {
  const url = mediaUrl(pathOrUrl)
  const token = getWebuiToken()
  if (!token) {
    return url
  }
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/** Probe health; returns true if ok. Uses current base or optional override. */
export async function probeApiHealth(baseOverride?: string): Promise<boolean> {
  let url: string
  if (baseOverride !== undefined) {
    const origin = normalizeApiBase(baseOverride)
    url = origin ? `${origin}/api/health` : "/api/health"
  } else {
    url = apiUrl("/api/health")
  }
  try {
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

/**
 * If no saved base and relative health fails on localhost, try default local port.
 * Does not overwrite an existing base.
 */
export async function ensureLocalApiBaseHint(): Promise<void> {
  if (getApiBase()) return
  if (await probeApiHealth("")) return
  if (typeof window === "undefined") return
  const host = window.location.hostname
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return
  if (await probeApiHealth(DEFAULT_LOCAL_API_BASE)) {
    setApiBase(DEFAULT_LOCAL_API_BASE)
  }
}
