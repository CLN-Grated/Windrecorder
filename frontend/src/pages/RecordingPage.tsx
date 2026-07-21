import { useEffect, useMemo, useState } from "react"
import { Video } from "lucide-react"

import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { I18nMarkdown } from "@/components/I18nMarkdown"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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

type Settings = {
  start_recording_on_startup: boolean
  startup_shortcut: boolean
  record_mode: string
  screenshot_interval_second: number
  record_deep_linking: boolean
  is_record_system_sound: boolean
  screentime_not_change_to_pause_record: number
  OCR_index_strategy: number
  exclude_words: string[]
  record_encoder: string
  record_bitrate: number
  vid_store_day: number
  vid_compress_day: number
  video_compress_rate: string | number
  compress_encoder: string
  compress_accelerator: string
  compress_quality: number
  compress_cpu_threads?: number | null
  multi_display_record_strategy: string
  record_single_display_index: number
  record_screenshot_method_capture_foreground_window_only: boolean
  convert_screenshots_to_vid_energy_saving_mode: number
}

const COMPRESS_RATE_OPTIONS = ["1", "0.75", "0.5", "0.25"] as const

export default function RecordingPage() {
  const t = useT()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [encoders, setEncoders] = useState<string[]>([])
  const [compressEncoders, setCompressEncoders] = useState<string[]>([])
  const [compressAccelerators, setCompressAccelerators] = useState<Record<string, string[]>>({})
  const [displayCount, setDisplayCount] = useState(1)
  const [displayLabels, setDisplayLabels] = useState<string[]>([])
  const [excludeText, setExcludeText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .recordingOptions()
      .then((data) => {
        const s = data.settings as Settings
        setSettings({
          ...s,
          video_compress_rate: String(s.video_compress_rate ?? "1"),
          convert_screenshots_to_vid_energy_saving_mode: Number(
            s.convert_screenshots_to_vid_energy_saving_mode ?? 0,
          ),
        })
        setExcludeText((s.exclude_words || []).join(", "))
        setEncoders((data.record_encoders as string[]) || [])
        setCompressEncoders((data.compress_encoders as string[]) || [])
        setCompressAccelerators((data.compress_accelerators as Record<string, string[]>) || {})
        setDisplayCount(Number(data.display_count) || 1)
        setDisplayLabels((data.display_info_formatted as string[]) || [])
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
      const payload = {
        ...settings,
        video_compress_rate: String(settings.video_compress_rate),
        exclude_words: excludeText
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length >= 2),
      }
      const res = await api.recordingSave(payload)
      setMessage(`${t("utils_toast_setting_saved")} (${res.applied.length})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const accelItems = useMemo(() => {
    if (!settings) return [] as { label: string; value: string }[]
    const list = compressAccelerators[settings.compress_encoder] || []
    return list.map((a) => ({ label: a, value: a }))
  }, [compressAccelerators, settings])

  if (loading || !settings) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const recordModeItems = [
    {
      label: t("rs_text_record_mode_option_screenshot_array"),
      value: "screenshot_array",
    },
    { label: t("rs_text_record_mode_option_ffmpeg"), value: "ffmpeg" },
  ]
  const ocrStrategyItems = [
    { label: t("rs_text_ocr_manual_update"), value: "0" },
    { label: t("rs_text_ocr_auto_update"), value: "1" },
  ]
  const energyModeItems = [
    { label: t("rs_option_energy_saving_instantly"), value: "0" },
    { label: t("rs_option_energy_saving_plug"), value: "1" },
    { label: t("rs_option_energy_saving_idle"), value: "2" },
  ]
  const multiDisplayItems = [
    {
      label: t("rs_text_record_strategy_option_all").replace("{num}", String(displayCount)),
      value: "all",
    },
    { label: t("rs_text_record_strategy_option_single"), value: "single" },
  ]
  const displayIndexItems = displayLabels.map((label, i) => ({
    label,
    value: String(i + 1),
  }))
  const recordEncoderItems = encoders.map((e) => ({ label: e, value: e }))
  const compressEncoderItems = compressEncoders.map((e) => ({ label: e, value: e }))
  const compressRateItems = COMPRESS_RATE_OPTIONS.map((r) => ({ label: r, value: r }))

  const showMultiDisplay =
    displayCount > 1 &&
    (settings.record_mode === "ffmpeg" ||
      !settings.record_screenshot_method_capture_foreground_window_only)

  const patch = (partial: Partial<Settings>) => setSettings({ ...settings, ...partial })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        titleKey="rs_md_title"
        badge={<Badge variant="secondary">Recording</Badge>}
        description={
          <span className="inline-flex items-center gap-1">
            <Video className="size-3.5" /> WebUI Next
          </span>
        }
      />
      <Alert>
        <AlertTitle>{t("rs_text_need_to_restart_after_save_setting")}</AlertTitle>
      </Alert>
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
            <I18nMarkdown k="rs_md_record_setting_title" variant="sectionTitle" />
          </CardTitle>
          <CardDescription>{t("webui_rs_core_capture")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.startup_shortcut}
              onCheckedChange={(c) => patch({ startup_shortcut: c === true })}
            />
            {t("rs_checkbox_start_record_when_startup")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.start_recording_on_startup}
              onCheckedChange={(c) => patch({ start_recording_on_startup: c === true })}
            />
            {t("rs_checkbox_is_start_recording_on_start_app")}
          </label>
          <label className="text-sm">
            {t("rs_text_record_mode")}
            <Select
              items={recordModeItems}
              value={settings.record_mode}
              onValueChange={(v) => {
                if (v != null) patch({ record_mode: v })
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {recordModeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          {settings.record_mode === "screenshot_array" ? (
            <>
              <label className="text-sm">
                {t("rs_input_screenshot_interval_second")}
                <Input
                  type="number"
                  min={3}
                  max={15}
                  value={settings.screenshot_interval_second}
                  onChange={(e) => patch({ screenshot_interval_second: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settings.record_screenshot_method_capture_foreground_window_only}
                  onCheckedChange={(c) =>
                    patch({ record_screenshot_method_capture_foreground_window_only: c === true })
                  }
                />
                {t("rs_checkbox_record_screenshot_method_capture_foreground_window_only")}
              </label>
              <label className="text-sm">
                {t("rs_text_energy_saving")}
                <Select
                  items={energyModeItems}
                  value={String(settings.convert_screenshots_to_vid_energy_saving_mode)}
                  onValueChange={(v) => {
                    if (v != null) patch({ convert_screenshots_to_vid_energy_saving_mode: Number(v) })
                  }}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {energyModeItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            </>
          ) : (
            <>
              <label className="text-sm">
                {t("rs_text_record_encoder")}
                <Select
                  items={recordEncoderItems}
                  value={settings.record_encoder}
                  onValueChange={(v) => {
                    if (v != null) patch({ record_encoder: v })
                  }}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {recordEncoderItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm">
                {t("rs_text_record_bitrate")}
                <Input
                  type="number"
                  min={50}
                  max={10000}
                  value={settings.record_bitrate}
                  onChange={(e) => patch({ record_bitrate: Number(e.target.value) })}
                />
              </label>
            </>
          )}

          {showMultiDisplay ? (
            <>
              <label className="text-sm">
                {t("rs_text_record_range")}
                <Select
                  items={multiDisplayItems}
                  value={settings.multi_display_record_strategy}
                  onValueChange={(v) => {
                    if (v != null) patch({ multi_display_record_strategy: v })
                  }}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {multiDisplayItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
              {settings.multi_display_record_strategy === "single" && displayIndexItems.length > 0 ? (
                <label className="text-sm">
                  {t("rs_text_record_single_display_select")}
                  <Select
                    items={displayIndexItems}
                    value={String(settings.record_single_display_index)}
                    onValueChange={(v) => {
                      if (v != null) patch({ record_single_display_index: Number(v) })
                    }}
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {displayIndexItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
            </>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.record_deep_linking}
              onCheckedChange={(c) => patch({ record_deep_linking: c === true })}
            />
            {t("rs_checkbox_record_deep_linking")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.is_record_system_sound}
              onCheckedChange={(c) => patch({ is_record_system_sound: c === true })}
            />
            {t("rs_checkbox_is_record_system_sound")}
          </label>
          <label className="text-sm">
            {t("rs_input_stop_recording_when_screen_freeze")}
            <Input
              type="number"
              min={0}
              value={settings.screentime_not_change_to_pause_record}
              onChange={(e) =>
                patch({ screentime_not_change_to_pause_record: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            {t("rs_text_skip_recording_by_wintitle")}
            <Input
              className="mt-1"
              value={excludeText}
              onChange={(e) => setExcludeText(e.target.value)}
              placeholder={t("rs_tag_input_tip")}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <I18nMarkdown k="set_md_auto_maintain" variant="sectionTitle" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            {t("rs_selectbox_ocr_strategy")}
            <Select
              items={ocrStrategyItems}
              value={String(settings.OCR_index_strategy)}
              onValueChange={(v) => {
                if (v != null) patch({ OCR_index_strategy: Number(v) })
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ocrStrategyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            {t("set_input_video_hold_days")}
            <Input
              type="number"
              min={0}
              value={settings.vid_store_day}
              onChange={(e) => patch({ vid_store_day: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            {t("rs_input_vid_compress_time")}
            <Input
              type="number"
              min={0}
              value={settings.vid_compress_day}
              onChange={(e) => patch({ vid_compress_day: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            {t("rs_selectbox_compress_ratio")}
            <Select
              items={compressRateItems}
              value={String(settings.video_compress_rate)}
              onValueChange={(v) => {
                if (v != null) patch({ video_compress_rate: v })
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {compressRateItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            {t("rs_text_compress_encoder")}
            <Select
              items={compressEncoderItems}
              value={settings.compress_encoder}
              onValueChange={(v) => {
                if (v == null) return
                const nextAcc = (compressAccelerators[v] || [])[0] || settings.compress_accelerator
                patch({ compress_encoder: v, compress_accelerator: nextAcc })
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {compressEncoderItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            {t("rs_text_compress_accelerator")}
            <Select
              items={accelItems}
              value={settings.compress_accelerator}
              onValueChange={(v) => {
                if (v != null) patch({ compress_accelerator: v })
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {accelItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            {t("rs_text_compress_CRF")}
            <Input
              type="number"
              min={0}
              max={50}
              value={settings.compress_quality}
              onChange={(e) => patch({ compress_quality: Number(e.target.value) })}
            />
          </label>
          {settings.compress_accelerator === "cpu" ? (
            <label className="text-sm">
              {t("rs_text_compress_cpu_threads")}
              <Input
                type="number"
                min={1}
                value={settings.compress_cpu_threads ?? 1}
                onChange={(e) => patch({ compress_cpu_threads: Number(e.target.value) })}
              />
            </label>
          ) : null}
        </CardContent>
      </Card>

      <Separator />
      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? "..." : t("text_apply_changes")}
      </Button>
    </div>
  )
}
