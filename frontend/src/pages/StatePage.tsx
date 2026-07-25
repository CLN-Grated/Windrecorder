import { useCallback, useEffect, useMemo, useState } from "react"
import { BarChart3, ImageIcon, RefreshCw } from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"

type MonthPoint = { day: number; hours: number; data_count: number }
type YearPoint = { month: number; day: number; data_count: number }

function ScatterMonth({ points }: { points: MonthPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.data_count))
  // 31 days x 24 hours grid, sparse render of non-zero
  const cells = points.filter((p) => p.data_count > 0)
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-md border bg-muted/20">
      <svg viewBox="0 0 310 240" className="h-full w-full">
        {cells.map((p) => {
          const x = (p.day - 1) * 10 + 5
          const y = 240 - p.hours * 10
          const r = 2 + (p.data_count / max) * 6
          return <circle key={`${p.day}-${p.hours}`} cx={x} cy={y} r={r} className="fill-primary/70" />
        })}
      </svg>
    </div>
  )
}

function ScatterYear({ points }: { points: YearPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.data_count))
  const cells = points.filter((p) => p.data_count > 0)
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-md border bg-muted/20">
      <svg viewBox="0 0 360 310" className="h-full w-full">
        {cells.map((p) => {
          const x = (p.month - 1) * 30 + 15
          const y = p.day * 10
          const r = 1.5 + (p.data_count / max) * 5
          return <circle key={`${p.month}-${p.day}`} cx={x} cy={y} r={r} className="fill-primary/60" />
        })}
      </svg>
    </div>
  )
}

export default function StatePage() {
  const t = useT()
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthPoints, setMonthPoints] = useState<MonthPoint[]>([])
  const [yearPoints, setYearPoints] = useState<YearPoint[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxHd, setLightboxHd] = useState(false)
  const [lightboxHdStats, setLightboxHdStats] = useState<{ hits: number; fallback: number } | null>(null)
  const [wordcloudUrl, setWordcloudUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, y, assets] = await Promise.all([
        api.monthScatter(year, month),
        api.yearScatter(year),
        api.stateAssets(year, month),
      ])
      setMonthPoints(m.points)
      setYearPoints(y.points)
      setLightboxUrl(assets.lightbox_url)
      setWordcloudUrl(assets.wordcloud_url)
      setLightboxHdStats(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    void load()
  }, [load])

  const genLightbox = async () => {
    setBusy("lightbox")
    setError(null)
    try {
      const quality = lightboxHd ? "hd" : "standard"
      const r = await api.generateLightbox(year, month, quality)
      // bust browser cache after overwrite of same filename
      const url = r.image_url
      setLightboxUrl(url ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : null)
      if (quality === "hd" && r.ok) {
        setLightboxHdStats({
          hits: r.hd_source_hits ?? 0,
          fallback: r.hd_fallback_count ?? 0,
        })
      } else {
        setLightboxHdStats(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const genWordcloud = async () => {
    setBusy("wordcloud")
    try {
      const r = await api.generateWordcloud(year, month)
      setWordcloudUrl(r.image_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        titleKey="stat_md_month_title"
        badge={<Badge variant="secondary">Summary</Badge>}
        description={<span className="inline-flex items-center gap-1"><BarChart3 className="size-3.5" /> WebUI Next</span>}
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="w-24"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
            <Input
              type="number"
              className="w-20"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Math.min(12, Math.max(1, Number(e.target.value) || month)))}
            />
            <Button size="icon-sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("webui_error")}</AlertTitle>
          <AlertDescription className="break-all">{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <I18nMarkdown k="stat_md_month_title" variant="sectionTitle" />
            </CardTitle>
            <CardDescription>
              {year}-{String(month).padStart(2, "0")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !monthPoints.length ? <Skeleton className="h-48 w-full" /> : <ScatterMonth points={monthPoints} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <I18nMarkdown k="stat_md_year_title" vars={{ stat_year_title: year }} variant="sectionTitle" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !yearPoints.length ? <Skeleton className="h-56 w-full" /> : <ScatterYear points={yearPoints} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <I18nMarkdown k="stat_md_memory_title" variant="sectionTitle" />
          </CardTitle>
          <CardDescription>{t("webui_stat_memory_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void genLightbox()} disabled={busy === "lightbox"}>
                <ImageIcon className="size-4" />
                {busy === "lightbox"
                  ? lightboxHd
                    ? t("stat_text_generating_lightbox_hd")
                    : t("stat_text_generating_lightbox")
                  : t("stat_btn_generate_lightbox")}
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={lightboxHd}
                  onCheckedChange={(checked) => setLightboxHd(checked === true)}
                  disabled={busy === "lightbox"}
                />
                {t("stat_checkbox_lightbox_hd")}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">{t("stat_text_lightbox_hd_help")}</p>
            {lightboxHdStats ? (
              <p className="text-xs text-muted-foreground">
                {t("stat_text_lightbox_hd_result", {
                  hits: lightboxHdStats.hits,
                  fallback: lightboxHdStats.fallback,
                })}
              </p>
            ) : null}
            {lightboxUrl ? (
              <img src={lightboxUrl} alt="lightbox" className="w-full rounded-lg border object-contain" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("stat_text_no_month_lightbox")}</p>
            )}
          </div>
          <div className="space-y-2">
            <Button onClick={() => void genWordcloud()} disabled={busy === "wordcloud"}>
              {busy === "wordcloud" ? t("stat_text_generating_word_cloud") : t("stat_btn_generate_update_word_cloud")}
            </Button>
            {wordcloudUrl ? (
              <img src={wordcloudUrl} alt="wordcloud" className="w-full rounded-lg border object-contain" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("stat_text_no_month_word_cloud_pic")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
