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

type Messages = Record<string, string>

type I18nContextValue = {
  lang: string
  messages: Messages
  ready: boolean
  error: string | null
  config: PublicConfig | null
  t: (key: string, vars?: Record<string, string | number>) => string
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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState("en")
  const [messages, setMessages] = useState<Messages>({})
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [i18n, pub] = await Promise.all([api.i18n(), api.publicConfig()])
      setLang(i18n.lang)
      setMessages(i18n.messages || {})
      setConfig(pub)
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

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = messages[key] ?? `(${key})`
      return formatMessage(raw, vars)
    },
    [messages],
  )

  const value = useMemo(
    () => ({ lang, messages, ready, error, config, t, refresh }),
    [lang, messages, ready, error, config, t, refresh],
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
