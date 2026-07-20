import { useEffect, useState } from "react"
import { FlaskConical } from "lucide-react"

import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

type LabSettings = {
  enable_img_embed_search: boolean
  img_embed_module_install: boolean
  open_ai_base_url: string
  open_ai_modelname: string
  open_ai_api_key_set: boolean
  enable_ai_extract_tag: boolean
  enable_ai_day_poem: boolean
  ai_extract_tag_wintitle_limit: number
  ai_extract_tag_filter_words: string[]
}

export default function LabPage() {
  const t = useT()
  const [settings, setSettings] = useState<LabSettings | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [filterText, setFilterText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    api
      .labSettings()
      .then((s) => {
        const lab = s as LabSettings
        setSettings(lab)
        setFilterText((lab.ai_extract_tag_filter_words || []).join(", "))
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
      const payload: Record<string, unknown> = {
        ...settings,
        ai_extract_tag_filter_words: filterText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }
      if (apiKey) payload.open_ai_api_key = apiKey
      const res = await api.labSave(payload)
      setMessage(`${t("utils_toast_setting_saved")} (${res.applied.length})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const testLlm = async () => {
    if (!settings) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.labTestLlm({
        open_ai_base_url: settings.open_ai_base_url,
        open_ai_modelname: settings.open_ai_modelname,
        open_ai_api_key: apiKey || undefined,
      })
      setTestResult(`${res.success ? "OK" : "FAIL"}: ${res.respond}`)
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : String(e))
    } finally {
      setTesting(false)
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
        <FlaskConical className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("lab_title")}</h1>
        <Badge variant="secondary">Lab</Badge>
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
          <CardTitle className="text-base">{t("lab_title_image_semantic_index")}</CardTitle>
          <CardDescription>
            {settings.img_embed_module_install ? "module installed" : t("lab_tip_image_semantic_index_not_install")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!settings.img_embed_module_install}
              checked={settings.enable_img_embed_search}
              onChange={(e) => setSettings({ ...settings, enable_img_embed_search: e.target.checked })}
            />
            {t("set_checkbox_enable_img_emb")}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("lab_title_llm_features")}</CardTitle>
          <CardDescription>{t("lab_tip_llm_api_endpoint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            base url
            <Input
              value={settings.open_ai_base_url}
              onChange={(e) => setSettings({ ...settings, open_ai_base_url: e.target.value })}
            />
          </label>
          <label className="text-sm">
            model
            <Input
              value={settings.open_ai_modelname}
              onChange={(e) => setSettings({ ...settings, open_ai_modelname: e.target.value })}
            />
          </label>
          <label className="text-sm">
            api key {settings.open_ai_api_key_set ? "(set)" : "(empty)"}
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enable_ai_extract_tag}
              onChange={(e) => setSettings({ ...settings, enable_ai_extract_tag: e.target.checked })}
            />
            AI extract tag
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enable_ai_day_poem}
              onChange={(e) => setSettings({ ...settings, enable_ai_day_poem: e.target.checked })}
            />
            AI day poem
          </label>
          <label className="text-sm">
            wintitle limit
            <Input
              type="number"
              value={settings.ai_extract_tag_wintitle_limit}
              onChange={(e) =>
                setSettings({ ...settings, ai_extract_tag_wintitle_limit: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            filter words
            <Input value={filterText} onChange={(e) => setFilterText(e.target.value)} />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button variant="outline" onClick={() => void testLlm()} disabled={testing}>
              {testing ? t("lab_text_testing") : t("lab_btn_test")}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "..." : t("text_apply_changes")}
            </Button>
          </div>
          {testResult ? <p className="md:col-span-2 text-sm text-muted-foreground break-all">{testResult}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
