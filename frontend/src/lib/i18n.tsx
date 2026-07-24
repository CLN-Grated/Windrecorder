import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { api, type PublicConfig } from "@/lib/api"
import { ensureLocalApiBaseHint } from "@/lib/api-base"
import { ZH_MESSAGES } from "@/lib/zh-messages"

type Messages = Record<string, string>

type I18nContextValue = {
  lang: string
  messages: Messages
  ready: boolean
  error: string | null
  config: PublicConfig | null
  /** Plain text for attributes/placeholders — markdown markers stripped. */
  t: (key: string, vars?: Record<string, string | number>) => string
  /** Raw markdown string after {var} format — for I18nMarkdown. */
  tRaw: (key: string, vars?: Record<string, string | number>) => string
  refresh: () => Promise<void>
}

const I18nContext = createContext<I18nContextValue | null>(null)

function formatMessage(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name]
    return v === undefined || v === null ? `{${name}}` : String(v)
  })
}

/** Strip Streamlit-oriented markdown for use in DOM attributes / plain labels. */
export function stripMarkdownForUi(text: string): string {
  let s = text
  // headings at line start
  s = s.replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
  // bold / italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1")
  s = s.replace(/\*([^*]+)\*/g, "$1")
  s = s.replace(/__([^_]+)__/g, "$1")
  // inline code
  s = s.replace(/`([^`]+)`/g, "$1")
  // very light HTML tags → space/empty
  s = s.replace(/<br\s*\/?>/gi, "\n")
  s = s.replace(/<\/?p[^>]*>/gi, "\n")
  s = s.replace(/<[^>]+>/g, "")
  // collapse whitespace
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return s
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      try {
        await ensureLocalApiBaseHint()
        const pub = await api.publicConfig()
        setConfig(pub)
      } catch {
        setConfig(null)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tRaw = useCallback((key: string, vars?: Record<string, string | number>) => {
    const raw = ZH_MESSAGES[key] ?? `(${key})`
    return formatMessage(raw, vars)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => stripMarkdownForUi(tRaw(key, vars)),
    [tRaw],
  )

  const value = useMemo(
    () => ({
      lang: "sc",
      messages: ZH_MESSAGES,
      ready,
      error,
      config,
      t,
      tRaw,
      refresh,
    }),
    [ready, error, config, t, tRaw, refresh],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}

export function useT() {
  return useI18n().t
}

export function useTRaw() {
  return useI18n().tRaw
}
