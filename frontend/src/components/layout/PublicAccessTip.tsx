import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ShieldAlert, X } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

const DISMISS_KEY = "wr_dismiss_no_password_public_tip"

/** True for loopback / common private IPv4 / .local hostnames. */
export function isLocalOrPrivateHost(hostname: string): boolean {
  const h = (hostname || "").toLowerCase().replace(/^\[|\]$/g, "")
  if (!h) return true
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1") return true
  if (h.endsWith(".local") || h.endsWith(".localhost")) return true

  // IPv4 private ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10) return true
    if (a === 127) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 169 && b === 254) return true // link-local
    if (a === 0) return true
  }

  // Unique local IPv6 fc00::/7, link-local fe80::/10
  if (h.includes(":")) {
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true
  }
  return false
}

/**
 * Show a dismissible tip when WebUI has no password and the page is opened
 * from a non-localhost / non-private host (risk of LAN/public exposure).
 */
export function PublicAccessTip() {
  const { t, config, ready } = useI18n()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  const host = typeof window !== "undefined" ? window.location.hostname : "localhost"
  const isPrivate = useMemo(() => isLocalOrPrivateHost(host), [host])

  const passwordOn = Boolean(config?.webui_password_enabled)
  // config is null until authenticated / loaded; only tip when we know password is off
  const show =
    ready && config != null && !passwordOn && !isPrivate && !dismissed

  if (!show) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div className="border-b bg-amber-50/90 px-4 py-2 dark:bg-amber-950/40">
      <div className="mx-auto max-w-7xl">
        <Alert className="border-amber-200 bg-transparent dark:border-amber-900">
          <ShieldAlert className="text-amber-700 dark:text-amber-400" />
          <AlertTitle className="text-amber-950 dark:text-amber-100">
            {t("webui_tip_no_password_public_title")}
          </AlertTitle>
          <AlertDescription className="text-amber-900/90 dark:text-amber-100/80">
            <p>
              {t("webui_tip_no_password_public_desc")}{" "}
              <span className="font-mono text-xs">({host})</span>
            </p>
            <p className="mt-1">
              <Link
                to="/setting"
                className="inline-flex h-7 items-center rounded-2xl border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
              >
                {t("webui_tip_go_settings")}
              </Link>
            </p>
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Dismiss"
              onClick={dismiss}
              className="text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
            >
              <X className="size-4" />
            </Button>
          </AlertAction>
        </Alert>
      </div>
    </div>
  )
}
