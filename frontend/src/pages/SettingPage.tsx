import { useEffect, useMemo, useState } from "react"
import { Settings, Trash2 } from "lucide-react"

import { api, type DbStatus } from "@/lib/api"
import { useI18n, useT } from "@/lib/i18n"
import { I18nMarkdown, MarkdownBlock } from "@/components/I18nMarkdown"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

type ClearScopeInfo = {
  id: string
  label_key: string
  path_hint: string
  file_count: number
  byte_size: number
  human_size: string
  exists: boolean
  target_count: number
}

type ClearPreview = {
  permanent: boolean
  is_recording: boolean
  can_clear_data?: boolean
  recording_state?: string
  recording_message_key?: string
  scopes: Record<string, ClearScopeInfo>
  total_if_all: { file_count: number; byte_size: number; human_size: string }
}

const CLEAR_SCOPE_ORDER = [
  "ocr_db",
  "img_emb",
  "videos",
  "screenshot_cache",
  "result_assets",
] as const

type SettingValues = {
  lang: string
  ocr_engine: string
  ocr_lang: string
  third_party_engine_ocr_lang: string[]
  support_ocr_lst: string[]
  index_reduce_same_content_at_different_time: boolean
  recycle_deleted_files: boolean
  enable_3_columns_in_oneday: boolean
  use_similar_ch_char_to_search: boolean
  enable_ocr_str_highlight_indicator: boolean
  enable_month_lightbox_watermark: boolean
  max_page_result: number
  day_begin_minutes: number
  oneday_timeline_pic_num: number
  wordcloud_user_stop_words: string[]
  ocr_image_crop_URBL: number[]
  multi_display_record_strategy?: string
  webui_port: number
  webui_auto_open_browser: boolean
  webui_password_enabled: boolean
  OCR_index_strategy?: number
}

type OcrSupportMeta = {
  support_multiple_languages?: boolean
  support_lang_option?: Record<string, string>
}

export default function SettingPage() {
  const t = useT()
  const { refresh } = useI18n()
  const [settings, setSettings] = useState<SettingValues | null>(null)
  const [osLangs, setOsLangs] = useState<string[]>([])
  const [ocrSupport, setOcrSupport] = useState<Record<string, OcrSupportMeta>>({})
  const [wordcloudText, setWordcloudText] = useState("")
  const [displayCount, setDisplayCount] = useState(1)
  const [displayLabels, setDisplayLabels] = useState<string[]>([])
  const [cropDisplayIndex, setCropDisplayIndex] = useState(0)
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null)
  const [about, setAbout] = useState<{ version: string; new_version: string | null; about_markdown: string } | null>(
    null,
  )
  const [password, setPassword] = useState("")
  const [removingPassword, setRemovingPassword] = useState(false)
  const [webuiPortText, setWebuiPortText] = useState("")
  const [webuiPortError, setWebuiPortError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingDb, setUpdatingDb] = useState(false)
  const [shutdownAfter, setShutdownAfter] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearStep, setClearStep] = useState<"select" | "ack">("select")
  const [clearPreview, setClearPreview] = useState<ClearPreview | null>(null)
  const [clearLoading, setClearLoading] = useState(false)
  const [clearExecuting, setClearExecuting] = useState(false)
  const [selectedScopes, setSelectedScopes] = useState<Record<string, boolean>>({})
  const [clearAck, setClearAck] = useState(false)
  /** 打开清除对话框时是否曾检测到录制；停录后用于显示绿色 tip */
  const [clearSawRecording, setClearSawRecording] = useState(false)

  const load = async () => {
    const [opts, ab] = await Promise.all([api.settingOptions(), api.settingAbout()])
    const raw = opts.settings as Partial<SettingValues>
    const s: SettingValues = {
      lang: raw.lang || "sc",
      ocr_engine: raw.ocr_engine || "",
      ocr_lang: raw.ocr_lang || "",
      third_party_engine_ocr_lang: Array.isArray(raw.third_party_engine_ocr_lang)
        ? raw.third_party_engine_ocr_lang
        : raw.third_party_engine_ocr_lang
          ? [String(raw.third_party_engine_ocr_lang)]
          : [],
      support_ocr_lst: raw.support_ocr_lst || [],
      index_reduce_same_content_at_different_time: Boolean(raw.index_reduce_same_content_at_different_time),
      recycle_deleted_files: Boolean(raw.recycle_deleted_files),
      enable_3_columns_in_oneday: Boolean(raw.enable_3_columns_in_oneday),
      use_similar_ch_char_to_search: Boolean(raw.use_similar_ch_char_to_search),
      enable_ocr_str_highlight_indicator: Boolean(raw.enable_ocr_str_highlight_indicator),
      enable_month_lightbox_watermark: Boolean(raw.enable_month_lightbox_watermark),
      max_page_result: Number(raw.max_page_result ?? 20),
      day_begin_minutes: Number(raw.day_begin_minutes ?? 0),
      oneday_timeline_pic_num: Number(raw.oneday_timeline_pic_num ?? 60),
      wordcloud_user_stop_words: Array.isArray(raw.wordcloud_user_stop_words)
        ? raw.wordcloud_user_stop_words
        : [],
      ocr_image_crop_URBL: Array.isArray(raw.ocr_image_crop_URBL)
        ? raw.ocr_image_crop_URBL.map((n) => Number(n) || 0)
        : [6, 6, 6, 3],
      multi_display_record_strategy: raw.multi_display_record_strategy || "all",
      webui_port: Number(raw.webui_port ?? 54100),
      webui_auto_open_browser: Boolean(raw.webui_auto_open_browser),
      webui_password_enabled: Boolean(raw.webui_password_enabled),
      OCR_index_strategy: raw.OCR_index_strategy,
    }
    const dc = Number(opts.display_count) || 1
    while (s.ocr_image_crop_URBL.length < dc * 4) {
      s.ocr_image_crop_URBL.push(6, 6, 6, 3)
    }
    setSettings(s)
    setWebuiPortText(String(s.webui_port))
    setWebuiPortError(null)
    setWordcloudText((s.wordcloud_user_stop_words || []).join(", "))
    setOsLangs((opts.os_support_lang as string[]) || [])
    setOcrSupport((opts.ocr_support as Record<string, OcrSupportMeta>) || {})
    setDisplayCount(dc)
    setDisplayLabels((opts.display_info_formatted as string[]) || [])
    setCropDisplayIndex(0)
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
    const portText = webuiPortText.trim()
    if (!/^\d+$/.test(portText)) {
      const message = t("webui_port_invalid")
      setWebuiPortError(message)
      setError(message)
      return
    }
    const webuiPort = Number(portText)
    if (!Number.isInteger(webuiPort) || webuiPort < 1 || webuiPort > 65535) {
      const message = t("webui_port_invalid")
      setWebuiPortError(message)
      setError(message)
      return
    }
    setSaving(true)
    setMessage(null)
    setError(null)
    setWebuiPortError(null)
    try {
      const payload: Record<string, unknown> = { ...settings, webui_port: webuiPort }
      // 产品固定中文，不再提交 lang
      delete payload.lang
      payload.wordcloud_user_stop_words = wordcloudText
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      // Password: blank keeps the existing password; removal is handled by its own button.
      if (password) {
        payload.webui_access_password = password
      }
      const res = await api.settingSave(payload)
      setMessage(
        res.webui_restart_required
          ? t("webui_restart_required")
          : `${t("utils_toast_setting_saved")} (${res.applied.join(", ")})`,
      )
      setPassword("")
      await load()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const removeWebuiPassword = async () => {
    setRemovingPassword(true)
    setMessage(null)
    setError(null)
    try {
      await api.settingSave({ webui_access_password: "" })
      setPassword("")
      setSettings((current) => (current ? { ...current, webui_password_enabled: false } : current))
      setMessage(t("webui_pwd_removed"))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRemovingPassword(false)
    }
  }

  const openClearDialog = async () => {
    setClearOpen(true)
    setClearStep("select")
    setClearAck(false)
    setClearSawRecording(false)
    setClearLoading(true)
    setClearPreview(null)
    setError(null)
    try {
      const preview = await api.settingClearDataPreview()
      setClearPreview(preview)
      if (preview.is_recording) setClearSawRecording(true)
      const next: Record<string, boolean> = {}
      for (const id of CLEAR_SCOPE_ORDER) {
        next[id] = false
      }
      setSelectedScopes(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setClearOpen(false)
    } finally {
      setClearLoading(false)
    }
  }

  // 清除对话框只要打开就轮询：打开时 idle 后用户再开录，也能更新门禁
  useEffect(() => {
    if (!clearOpen) return
    const poll = () => {
      api
        .settingClearDataPreview()
        .then((preview) => {
          setClearPreview(preview)
          if (
            preview.is_recording ||
            preview.recording_state === "stopping" ||
            preview.recording_state === "saving"
          ) {
            setClearSawRecording(true)
          }
        })
        .catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, 1000)
    return () => window.clearInterval(id)
  }, [clearOpen])

  const selectedScopeIds = useMemo(
    () => CLEAR_SCOPE_ORDER.filter((id) => selectedScopes[id]),
    [selectedScopes],
  )

  const selectedSummary = useMemo(() => {
    if (!clearPreview) return { file_count: 0, byte_size: 0, human_size: "0 B" }
    let file_count = 0
    let byte_size = 0
    for (const id of selectedScopeIds) {
      const s = clearPreview.scopes[id]
      if (!s) continue
      file_count += s.file_count
      byte_size += s.byte_size
    }
    // reuse backend-style human size roughly
    const units = ["B", "KB", "MB", "GB", "TB"]
    let size = byte_size
    let u = 0
    while (size >= 1024 && u < units.length - 1) {
      size /= 1024
      u++
    }
    const human_size = u === 0 ? `${byte_size} B` : `${size.toFixed(1)} ${units[u]}`
    return { file_count, byte_size, human_size }
  }, [clearPreview, selectedScopeIds])

  const executeClear = async () => {
    if (!clearAck || selectedScopeIds.length === 0) return
    setClearExecuting(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api.settingClearData([...selectedScopeIds])
      if (res.error === "recording" || (!res.ok && res.detail?.includes("录制"))) {
        setError(res.detail || t("webui_clear_recording"))
        setClearStep("select")
        return
      }
      const deleted = res.deleted_count ?? res.deleted?.length ?? 0
      const failed = res.failed_count ?? res.failed?.length ?? 0
      if (failed > 0) {
        setMessage(t("webui_clear_failed", { deleted, failed }))
      } else {
        setMessage(t("webui_clear_success", { deleted }))
      }
      setClearOpen(false)
      setClearStep("select")
      setClearAck(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setClearExecuting(false)
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
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        titleKey="set_md_title"
        badge={<Badge variant="secondary">Settings</Badge>}
        description={<span className="inline-flex items-center gap-1"><Settings className="size-3.5" /> WebUI Next</span>}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("webui_error")}</AlertTitle>
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
              ? t("webui_set_db_status_summary", {
                  count: dbStatus.video_count,
                  unindexed: dbStatus.unindexed_count,
                  eta: dbStatus.estimate_indexing_time,
                })
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
                      setError(res.error || t("webui_set_update_failed"))
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
                <Checkbox
                  checked={shutdownAfter}
                  disabled={updatingDb}
                  onCheckedChange={(checked) => setShutdownAfter(checked === true)}
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
              <Checkbox
                checked={settings.index_reduce_same_content_at_different_time}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    index_reduce_same_content_at_different_time: checked === true,
                  })
                }
              />
              {t("set_checkbox_reduce_same_content_at_different_time")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={settings.recycle_deleted_files}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, recycle_deleted_files: checked === true })
                }
              />
              {t("set_checkbox_recycle_deleted_files")}
            </label>
          </div>

          <Separator />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">
                <I18nMarkdown k="set_md_ocr_ignore_area" variant="sectionTitle" />
              </p>
              <p className="text-xs text-muted-foreground">{t("set_md_ocr_ignore_area_help")}</p>
            </div>
            {displayCount > 1 && settings.multi_display_record_strategy === "all" && displayLabels.length > 0 ? (
              <label className="block text-sm">
                {t("set_text_choose_displays")}
                <Select
                  items={displayLabels.map((label, i) => ({ label, value: String(i) }))}
                  value={String(cropDisplayIndex)}
                  onValueChange={(v) => {
                    if (v != null) setCropDisplayIndex(Number(v))
                  }}
                >
                  <SelectTrigger className="mt-1 w-full max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {displayLabels.map((label, i) => (
                        <SelectItem key={label} value={String(i)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {(() => {
              const base = Math.min(cropDisplayIndex, Math.max(0, displayCount - 1)) * 4
              const crop = settings.ocr_image_crop_URBL
              const setPad = (offset: number, value: number) => {
                const next = [...crop]
                while (next.length < base + 4) next.push(6, 6, 6, 3)
                next[base + offset] = Math.min(40, Math.max(0, value))
                setSettings({ ...settings, ocr_image_crop_URBL: next })
              }
              // 与 Streamlit / ocr_manager 一致：索引 0上 1右 2下 3左（百分数）
              const top = Number(crop[base + 0] ?? 6)
              const right = Number(crop[base + 1] ?? 6)
              const bottom = Number(crop[base + 2] ?? 6)
              const left = Number(crop[base + 3] ?? 3)
              return (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    {t("set_text_top_padding")}
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      value={top}
                      onChange={(e) => setPad(0, Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    {t("set_text_right_padding")}
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      value={right}
                      onChange={(e) => setPad(1, Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    {t("set_text_bottom_padding")}
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      value={bottom}
                      onChange={(e) => setPad(2, Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    {t("set_text_left_padding")}
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      value={left}
                      onChange={(e) => setPad(3, Number(e.target.value))}
                    />
                  </label>
                  <div className="relative col-span-full mx-auto aspect-video w-full max-w-lg overflow-hidden rounded-lg border bg-muted">
                    <div
                      className="absolute inset-0 bg-violet-500/25"
                      style={{
                        top: `${top}%`,
                        right: `${right}%`,
                        bottom: `${bottom}%`,
                        left: `${left}%`,
                      }}
                      title="OCR 有效区域示意"
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      OCR 有效区域（示意）
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("webui_set_ui_search_title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            {t("webui_port")}
            <Input
              type="number"
              min={1}
              max={65535}
              step={1}
              className="mt-1"
              value={webuiPortText}
              aria-invalid={Boolean(webuiPortError)}
              onChange={(e) => {
                setWebuiPortText(e.target.value)
                setWebuiPortError(null)
              }}
            />
            <span className="mt-1 block text-xs text-muted-foreground">{t("webui_port_help")}</span>
            {webuiPortError ? <span className="mt-1 block text-xs text-destructive">{webuiPortError}</span> : null}
          </label>
          <label className="flex items-start gap-2 text-sm pt-6">
            <Checkbox
              checked={settings.webui_auto_open_browser}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, webui_auto_open_browser: checked === true })
              }
            />
            <span>
              {t("webui_auto_open_browser")}
              <span className="mt-1 block text-xs text-muted-foreground">{t("webui_restart_hint")}</span>
            </span>
          </label>
          <label className="text-sm">
            {t("set_input_max_num_search_page")}
            <Input
              type="number"
              value={settings.max_page_result}
              onChange={(e) => setSettings({ ...settings, max_page_result: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            {t("set_input_day_begin_minutes")}
            <Input
              type="number"
              value={settings.day_begin_minutes}
              onChange={(e) => setSettings({ ...settings, day_begin_minutes: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.enable_3_columns_in_oneday}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enable_3_columns_in_oneday: checked === true })
              }
            />
            {t("set_checkbox_enable_3_columns_in_oneday")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.use_similar_ch_char_to_search}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, use_similar_ch_char_to_search: checked === true })
              }
            />
            {t("set_checkbox_use_similar_zh_char_to_search")}
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Checkbox
              checked={settings.enable_ocr_str_highlight_indicator}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enable_ocr_str_highlight_indicator: checked === true })
              }
            />
            {t("set_checkbox_enable_ocr_str_highlight_indicator")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.enable_month_lightbox_watermark}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enable_month_lightbox_watermark: checked === true })
              }
            />
            {t("lb_checkbox_add_watermark")}
          </label>
          <label className="text-sm">
            {t("set_input_oneday_timeline_thumbnail_num")}
            <Input
              type="number"
              min={50}
              max={100}
              value={settings.oneday_timeline_pic_num}
              onChange={(e) =>
                setSettings({ ...settings, oneday_timeline_pic_num: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            {t("set_input_wordcloud_filter")}
            <Input
              className="mt-1"
              value={wordcloudText}
              onChange={(e) => setWordcloudText(e.target.value)}
              placeholder={t("set_input_wordcloud_filter_help")}
            />
          </label>
          {(() => {
            const meta = ocrSupport[settings.ocr_engine]
            const multi = Boolean(meta?.support_multiple_languages)
            const opts = meta?.support_lang_option || {}
            const codes = Object.keys(opts)
            if (!multi || codes.length === 0) return null
            return (
              <div className="md:col-span-2 space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{t("set_selectbox_ocr_lang")}（第三方引擎）</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {codes.map((code) => {
                    const selected = settings.third_party_engine_ocr_lang.includes(code)
                    return (
                      <label key={code} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const on = checked === true
                            const next = on
                              ? [...settings.third_party_engine_ocr_lang, code]
                              : settings.third_party_engine_ocr_lang.filter((c) => c !== code)
                            setSettings({ ...settings, third_party_engine_ocr_lang: next })
                          }}
                        />
                        <span>
                          {opts[code] || code}{" "}
                          <span className="text-xs text-muted-foreground">({code})</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })()}
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
              placeholder={t("webui_pwd_placeholder")}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {settings.webui_password_enabled ? (
            <div>
              <Button
                type="button"
                variant="destructive"
                disabled={removingPassword || saving}
                onClick={() => void removeWebuiPassword()}
              >
                {removingPassword ? "..." : t("webui_pwd_remove")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">{t("webui_clear_data_title")}</CardTitle>
          <CardDescription>{t("webui_clear_data_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={() => void openClearDialog()}>
            <Trash2 className="size-4" />
            {t("webui_clear_data_btn")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("webui_set_about")}</CardTitle>
          <CardDescription>
            v{about?.version}
            {about?.new_version ? ` · ${t("webui_set_new_version", { version: about.new_version })}` : ""}
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

      <Dialog
        open={clearOpen}
        onOpenChange={(open) => {
          setClearOpen(open)
          if (!open) {
            setClearStep("select")
            setClearAck(false)
            setClearSawRecording(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!clearExecuting}>
          {clearStep === "select" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("webui_clear_data_title")}</DialogTitle>
                <DialogDescription>{t("webui_clear_confirm_hint")}</DialogDescription>
              </DialogHeader>
              {clearLoading || !clearPreview ? (
                <p className="text-sm text-muted-foreground">{t("webui_clear_loading")}</p>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const state = clearPreview.recording_state
                    const busy =
                      clearPreview.can_clear_data === false ||
                      clearPreview.is_recording ||
                      state === "recording" ||
                      state === "stopping" ||
                      state === "saving"
                    if (state === "stopping") {
                      return (
                        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                          <AlertTitle>{t("webui_clear_recording_stopping")}</AlertTitle>
                        </Alert>
                      )
                    }
                    if (state === "saving") {
                      return (
                        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                          <AlertTitle>{t("webui_clear_recording_saving")}</AlertTitle>
                        </Alert>
                      )
                    }
                    // 正在录制 / 不可清除：优先红色，绝不能被「曾停录」绿色 tip 盖住
                    if (busy) {
                      return (
                        <Alert variant="destructive">
                          <AlertTitle>{t("webui_clear_recording")}</AlertTitle>
                        </Alert>
                      )
                    }
                    // 仅在「当前已可清除」且本轮 dialog 曾见过录制时显示绿色
                    if (clearSawRecording) {
                      return (
                        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                          <AlertTitle>{t("webui_clear_recording_stopped")}</AlertTitle>
                        </Alert>
                      )
                    }
                    return null
                  })()}
                  <Alert variant="destructive">
                    <AlertDescription>{t("webui_clear_permanent")}</AlertDescription>
                  </Alert>
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {CLEAR_SCOPE_ORDER.map((id) => {
                      const s = clearPreview.scopes[id]
                      if (!s) return null
                      const disabled =
                        (clearPreview.can_clear_data === false || clearPreview.is_recording) ||
                        s.file_count === 0
                      return (
                        <li key={id}>
                          <label
                            className={`flex items-start gap-2 rounded-lg border p-2 text-sm hover:bg-muted/50 ${
                              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                            }`}
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={Boolean(selectedScopes[id])}
                              disabled={disabled}
                              onCheckedChange={(checked) =>
                                setSelectedScopes((prev) => ({
                                  ...prev,
                                  [id]: checked === true,
                                }))
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{t(s.label_key)}</span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {s.path_hint}
                              </span>
                              <span className="mt-0.5 block text-xs">
                                {t("webui_clear_files_line", {
                                  count: s.file_count,
                                  size: s.human_size,
                                })}
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="text-sm font-medium">
                    {t("webui_clear_selected_summary", {
                      count: selectedSummary.file_count,
                      size: selectedSummary.human_size,
                    })}
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={clearExecuting}
                  onClick={() => setClearOpen(false)}
                >
                  {t("webui_clear_cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    clearLoading ||
                    !clearPreview ||
                    clearPreview.is_recording ||
                    clearPreview.can_clear_data === false ||
                    selectedScopeIds.length === 0
                  }
                  onClick={() => {
                    if (selectedScopeIds.length === 0) {
                      setError(t("webui_clear_empty"))
                      return
                    }
                    setClearAck(false)
                    setClearStep("ack")
                  }}
                >
                  {t("webui_clear_next")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("webui_clear_ack_title")}</DialogTitle>
                <DialogDescription>{t("webui_clear_ack_desc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm">
                  {t("webui_clear_selected_summary", {
                    count: selectedSummary.file_count,
                    size: selectedSummary.human_size,
                  })}
                </p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {selectedScopeIds.map((id) => (
                    <li key={id}>{t(`webui_clear_scope_${id}`)}</li>
                  ))}
                </ul>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={clearAck}
                    onCheckedChange={(checked) => setClearAck(checked === true)}
                  />
                  <span className="font-medium text-destructive">{t("webui_clear_ack")}</span>
                </label>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={clearExecuting}
                  onClick={() => setClearStep("select")}
                >
                  {t("webui_clear_cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!clearAck || clearExecuting}
                  onClick={() => void executeClear()}
                >
                  {clearExecuting ? "..." : t("webui_clear_execute")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
