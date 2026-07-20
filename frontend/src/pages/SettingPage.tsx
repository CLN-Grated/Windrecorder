import { useEffect, useState } from "react"
import { Settings } from "lucide-react"

import { api } from "@/lib/api"
import { useI18n, useT } from "@/lib/i18n"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  enable_synonyms_recommend: boolean
  max_page_result: number
  day_begin_minutes: number
  oneday_timeline_pic_num: number
  webui_backend: string
  webui_password_enabled: boolean
}

export default function SettingPage() {
  const t = useT()
  const { refresh } = useI18n()
  const [settings, setSettings] = useState<SettingValues | null>(null)
  const [osLangs, setOsLangs] = useState<string[]>([])
  const [dbStatus, setDbStatus] = useState<{
    video_count: number
    unindexed_count: number
    estimate_indexing_time: string
    OCR_index_strategy: number
  } | null>(null)
  const [about, setAbout] = useState<{ version: string; new_version: string | null; about_markdown: string } | null>(
    null,
  )
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.settingOptions(), api.settingAbout()])
      .then(([opts, ab]) => {
        setSettings(opts.settings as SettingValues)
        setOsLangs((opts.os_support_lang as string[]) || [])
        setDbStatus(opts.db_status as typeof dbStatus)
        setAbout(ab)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const payload: Record<string, unknown> = { ...settings }
      if (password.length > 0 || password === "") {
        // empty string disables password when user clears intentionally via dedicated field submit
      }
      if (password) payload.webui_access_password = password
      const res = await api.settingSave(payload)
      setMessage(`${t("utils_toast_setting_saved")} (${res.applied.join(", ")})`)
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("set_md_title")}</h1>
        <Badge variant="secondary">Settings</Badge>
      </div>

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
          <CardTitle className="text-base">{t("set_md_index_db")}</CardTitle>
          <CardDescription>
            {dbStatus
              ? `videos ${dbStatus.video_count}, unindexed ${dbStatus.unindexed_count}, ETA ${dbStatus.estimate_indexing_time}`
              : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            {t("set_selectbox_local_ocr_engine")}
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={settings.ocr_engine}
              onChange={(e) => setSettings({ ...settings, ocr_engine: e.target.value })}
            >
              {(settings.support_ocr_lst || []).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t("set_selectbox_ocr_lang")}
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={settings.ocr_lang}
              onChange={(e) => setSettings({ ...settings, ocr_lang: e.target.value })}
            >
              {(osLangs.length ? osLangs : [settings.ocr_lang]).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">UI / Search</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Language
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={settings.lang}
              onChange={(e) => setSettings({ ...settings, lang: e.target.value })}
            >
              <option value="en">English</option>
              <option value="sc">简体中文</option>
              <option value="ja">日本語</option>
            </select>
          </label>
          <label className="text-sm">
            webui backend
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={settings.webui_backend}
              onChange={(e) => setSettings({ ...settings, webui_backend: e.target.value })}
            >
              <option value="fastapi">fastapi</option>
              <option value="streamlit">streamlit</option>
            </select>
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
          <label className="text-sm md:col-span-2">
            {t("set_pwd_text")} {settings.webui_password_enabled ? "(enabled)" : "(off)"}
            <Input
              type="password"
              value={password}
              placeholder="leave empty to keep; type new password to set"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
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
            <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: about.about_markdown }} />
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
