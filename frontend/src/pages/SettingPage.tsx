import { useEffect, useState } from "react"
import { Settings } from "lucide-react"

import { api, type DbStatus } from "@/lib/api"
import { useI18n, useT } from "@/lib/i18n"
import { I18nMarkdown, MarkdownBlock } from "@/components/I18nMarkdown"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

type SettingValues = {
  lang: string
  ocr_engine: string
  ocr_lang: string
  support_ocr_lst: string[]
  index_reduce_same_content_at_different_time: boolean
  recycle_deleted_files: boolean
  enable_3_columns_in_oneday: boolean
  use_similar_ch_char_to_search: boolean
  max_page_result: number
  day_begin_minutes: number
  oneday_timeline_pic_num: number
  webui_backend: string
  webui_password_enabled: boolean
  OCR_index_strategy?: number
}

export default function SettingPage() {
  const t = useT()
  const { refresh } = useI18n()
  const [settings, setSettings] = useState<SettingValues | null>(null)
  const [osLangs, setOsLangs] = useState<string[]>([])
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null)
  const [about, setAbout] = useState<{ version: string; new_version: string | null; about_markdown: string } | null>(
    null,
  )
  const [password, setPassword] = useState("")
  const [removePassword, setRemovePassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingDb, setUpdatingDb] = useState(false)
  const [shutdownAfter, setShutdownAfter] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const [opts, ab] = await Promise.all([api.settingOptions(), api.settingAbout()])
    setSettings(opts.settings as SettingValues)
    setOsLangs((opts.os_support_lang as string[]) || [])
    setDbStatus(opts.db_status as DbStatus)
    setAbout(ab)
  }

  useEffect(() => {
    load()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Poll manual update job while running
  useEffect(() => {
    if (!updatingDb) return
    const id = window.setInterval(() => {
      api
        .settingUpdateDbStatus()
        .then((job) => {
          setDbStatus((prev) => (prev ? { ...prev, update_job: job } : prev))
          if (!job.running) {
            setUpdatingDb(false)
            if (job.ok) {
              setMessage(t("set_text_db_updated_successful", { timeCostStr: `${job.time_cost_seconds ?? "?"}s` }))
            } else if (job.error) {
              setError(job.error)
            }
            void api.settingDbStatus().then(setDbStatus)
          }
        })
        .catch(() => {})
    }, 1500)
    return () => window.clearInterval(id)
  }, [updatingDb, t])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const payload: Record<string, unknown> = { ...settings }
      // Password: only send when setting a new one or explicitly removing (default is off / keep)
      if (removePassword) {
        payload.webui_access_password = ""
      } else if (password) {
        payload.webui_access_password = password
      }
      const res = await api.settingSave(payload)
      setMessage(`${t("utils_toast_setting_saved")} (${res.applied.join(", ")})`)
      setPassword("")
      setRemovePassword(false)
      await load()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const ocrEngineItems = (settings.support_ocr_lst || []).map((e) => ({ label: e, value: e }))
  const ocrLangItems = (osLangs.length ? osLangs : [settings.ocr_lang]).map((e) => ({
    label: e,
    value: e,
  }))
  const langItems = [
    { label: "English", value: "en" },
    { label: "简体中文", value: "sc" },
    { label: "日本語", value: "ja" },
  ]
  const webuiBackendItems = [
    { label: "fastapi", value: "fastapi" },
    { label: "streamlit", value: "streamlit" },
  ]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        titleKey="set_md_title"
        badge={<Badge variant="secondary">Settings</Badge>}
        description={<span className="inline-flex items-center gap-1"><Settings className="size-3.5" /> WebUI Next</span>}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="break-all">{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <I18nMarkdown k="set_md_index_db" variant="sectionTitle" />
          </CardTitle>
          <CardDescription>
            {dbStatus
              ? `videos ${dbStatus.video_count}, unindexed ${dbStatus.unindexed_count}, ETA ${dbStatus.estimate_indexing_time}`
              : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dbStatus?.message_key ? (
            <Alert variant={dbStatus.level === "warning" ? "destructive" : "default"}>
              <AlertTitle>
                {t(dbStatus.message_key, {
                  nocred_count: dbStatus.unindexed_count,
                  count: dbStatus.video_count,
                  timeCostStr: dbStatus.estimate_indexing_time,
                })}
              </AlertTitle>
            </Alert>
          ) : null}

          {(dbStatus?.manual_update_available || dbStatus?.OCR_index_strategy === 0) && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <Button
                type="button"
                variant="secondary"
                disabled={updatingDb || dbStatus?.update_job?.running}
                onClick={async () => {
                  setError(null)
                  setMessage(null)
                  try {
                    const res = await api.settingUpdateDb(shutdownAfter)
                    if (!res.ok) {
                      setError(res.error || "update failed")
                      return
                    }
                    setUpdatingDb(true)
                    setMessage(t("set_text_updating_db", { estimate_time_str: res.estimate_indexing_time || "" }))
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                {updatingDb || dbStatus?.update_job?.running
                  ? t("set_text_updating_db", { estimate_time_str: dbStatus?.estimate_indexing_time || "..." })
                  : t("set_btn_update_db_manual")}
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shutdownAfter}
                  disabled={updatingDb}
                  onChange={(e) => setShutdownAfter(e.target.checked)}
                />
                {t("set_checkbox_shutdown_after_updated")}
              </label>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              {t("set_selectbox_local_ocr_engine")}
              <Select
                items={ocrEngineItems}
                value={settings.ocr_engine}
                onValueChange={(v) => {
                  if (v != null) setSettings({ ...settings, ocr_engine: v })
                }}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ocrEngineItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm">
              {t("set_selectbox_ocr_lang")}
              <Select
                items={ocrLangItems}
                value={settings.ocr_lang}
                onValueChange={(v) => {
                  if (v != null) setSettings({ ...settings, ocr_lang: v })
                }}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ocrLangItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.index_reduce_same_content_at_different_time}
                onChange={(e) =>
                  setSettings({ ...settings, index_reduce_same_content_at_different_time: e.target.checked })
                }
              />
              {t("set_checkbox_reduce_same_content_at_different_time")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.recycle_deleted_files}
                onChange={(e) => setSettings({ ...settings, recycle_deleted_files: e.target.checked })}
              />
              {t("set_checkbox_recycle_deleted_files")}
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">UI / Search</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Language
            <Select
              items={langItems}
              value={settings.lang}
              onValueChange={(v) => {
                if (v != null) setSettings({ ...settings, lang: v })
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {langItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            webui backend
            <Select
              items={webuiBackendItems}
              value={settings.webui_backend}
              onValueChange={(v) => {
                if (v != null) setSettings({ ...settings, webui_backend: v })
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {webuiBackendItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            max page result
            <Input
              type="number"
              value={settings.max_page_result}
              onChange={(e) => setSettings({ ...settings, max_page_result: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            day begin minutes
            <Input
              type="number"
              value={settings.day_begin_minutes}
              onChange={(e) => setSettings({ ...settings, day_begin_minutes: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enable_3_columns_in_oneday}
              onChange={(e) => setSettings({ ...settings, enable_3_columns_in_oneday: e.target.checked })}
            />
            3 columns oneday
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.use_similar_ch_char_to_search}
              onChange={(e) => setSettings({ ...settings, use_similar_ch_char_to_search: e.target.checked })}
            />
            similar Chinese char search
          </label>
        </CardContent>
      </Card>

      <Card id="webui-password">
        <CardHeader>
          <CardTitle className="text-base">{t("webui_pwd_card_title")}</CardTitle>
          <CardDescription>{t("webui_pwd_card_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={settings.webui_password_enabled ? "default" : "secondary"}>
            {settings.webui_password_enabled ? t("webui_pwd_status_on") : t("webui_pwd_status_off")}
          </Badge>
          <label className="block text-sm">
            {t("set_pwd_text")}
            <Input
              type="password"
              className="mt-1"
              autoComplete="new-password"
              value={password}
              disabled={removePassword}
              placeholder={t("webui_pwd_placeholder")}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={removePassword}
              onChange={(e) => {
                setRemovePassword(e.target.checked)
                if (e.target.checked) setPassword("")
              }}
            />
            {t("webui_pwd_remove")}
          </label>
          <p className="text-xs text-muted-foreground">{t("webui_pwd_clear_hint")}</p>
          <p className="text-xs text-muted-foreground">{t("set_pwd_help")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
          <CardDescription>
            v{about?.version}
            {about?.new_version ? ` · new ${about.new_version}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {about?.about_markdown ? (
            <MarkdownBlock content={about.about_markdown} variant="body" className="max-w-none" />
          ) : (
            <p className="text-sm text-muted-foreground">Windrecorder</p>
          )}
        </CardContent>
      </Card>

      <Separator />
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "..." : t("text_apply_changes")}
      </Button>
    </div>
  )
}
