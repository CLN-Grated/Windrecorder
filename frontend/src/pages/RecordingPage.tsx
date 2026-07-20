import { useEffect, useState } from "react"
import { Video } from "lucide-react"

import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { I18nMarkdown } from "@/components/I18nMarkdown"
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
  multi_display_record_strategy: string
  record_single_display_index: number
  record_screenshot_method_capture_foreground_window_only: boolean
}

export default function RecordingPage() {
  const t = useT()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [encoders, setEncoders] = useState<string[]>([])
  const [compressEncoders, setCompressEncoders] = useState<string[]>([])
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
        setSettings(s)
        setExcludeText((s.exclude_words || []).join(", "))
        setEncoders((data.record_encoders as string[]) || [])
        setCompressEncoders((data.compress_encoders as string[]) || [])
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
    { label: "manual", value: "0" },
    { label: "auto", value: "1" },
  ]
  const recordEncoderItems = encoders.map((e) => ({ label: e, value: e }))
  const compressEncoderItems = compressEncoders.map((e) => ({ label: e, value: e }))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        titleKey="rs_md_title"
        badge={<Badge variant="secondary">Recording</Badge>}
        description={<span className="inline-flex items-center gap-1"><Video className="size-3.5" /> WebUI Next</span>}
      />
      <Alert>
        <AlertTitle>{t("rs_text_need_to_restart_after_save_setting")}</AlertTitle>
      </Alert>
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
            <I18nMarkdown k="rs_md_record_setting_title" variant="sectionTitle" />
          </CardTitle>
          <CardDescription>Core capture options</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.startup_shortcut}
              onChange={(e) => setSettings({ ...settings, startup_shortcut: e.target.checked })}
            />
            {t("rs_checkbox_start_record_when_startup")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.start_recording_on_startup}
              onChange={(e) => setSettings({ ...settings, start_recording_on_startup: e.target.checked })}
            />
            {t("rs_checkbox_is_start_recording_on_start_app")}
          </label>
          <label className="text-sm">
            {t("rs_text_record_mode")}
            <Select
              items={recordModeItems}
              value={settings.record_mode}
              onValueChange={(v) => {
                if (v != null) setSettings({ ...settings, record_mode: v })
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
          <label className="text-sm">
            {t("rs_input_screenshot_interval_second")}
            <Input
              type="number"
              min={3}
              max={15}
              value={settings.screenshot_interval_second}
              onChange={(e) =>
                setSettings({ ...settings, screenshot_interval_second: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.record_deep_linking}
              onChange={(e) => setSettings({ ...settings, record_deep_linking: e.target.checked })}
            />
            deep linking
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.record_screenshot_method_capture_foreground_window_only}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  record_screenshot_method_capture_foreground_window_only: e.target.checked,
                })
              }
            />
            foreground only
          </label>
          <label className="text-sm md:col-span-2">
            exclude words
            <Input value={excludeText} onChange={(e) => setExcludeText(e.target.value)} />
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
            OCR index strategy
            <Select
              items={ocrStrategyItems}
              value={String(settings.OCR_index_strategy)}
              onValueChange={(v) => {
                if (v != null) setSettings({ ...settings, OCR_index_strategy: Number(v) })
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
            store days
            <Input
              type="number"
              value={settings.vid_store_day}
              onChange={(e) => setSettings({ ...settings, vid_store_day: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            compress days
            <Input
              type="number"
              value={settings.vid_compress_day}
              onChange={(e) => setSettings({ ...settings, vid_compress_day: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            record encoder
            <Select
              items={recordEncoderItems}
              value={settings.record_encoder}
              onValueChange={(v) => {
                if (v != null) setSettings({ ...settings, record_encoder: v })
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
            compress encoder
            <Select
              items={compressEncoderItems}
              value={settings.compress_encoder}
              onValueChange={(v) => {
                if (v != null) setSettings({ ...settings, compress_encoder: v })
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
            bitrate
            <Input
              type="number"
              value={settings.record_bitrate}
              onChange={(e) => setSettings({ ...settings, record_bitrate: Number(e.target.value) })}
            />
          </label>
        </CardContent>
      </Card>

      <Separator />
      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? "..." : t("text_apply_changes")}
      </Button>
    </div>
  )
}
