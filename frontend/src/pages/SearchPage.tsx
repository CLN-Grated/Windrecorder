import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"

import {
  api,
  formatClock,
  formatDateTime,
  type GlobalSearchHit,
  type GlobalSearchResult,
  type SearchBounds,
} from "@/lib/api"
import { useI18n, useT } from "@/lib/i18n"
import { highlightOcrText } from "@/lib/ocr-highlight"
import { cn } from "@/lib/utils"
import { I18nMarkdown } from "@/components/I18nMarkdown"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"

type Mode = "ocr_month" | "ocr_exact"

function tsToDateInput(ts: number): string {
  // backend utils.seconds_to_datetime is naive UTC-from-epoch style; use ISO date part from bounds strings when possible
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function dateInputToIsoStart(date: string): string {
  return `${date}T00:00:00`
}

function dateInputToIsoEnd(date: string): string {
  return `${date}T23:59:59`
}

export default function SearchPage() {
  const t = useT()
  const { config } = useI18n()
  const highlightOn = Boolean(config?.enable_ocr_str_highlight_indicator)
  const [bounds, setBounds] = useState<SearchBounds | null>(null)
  const [mode, setMode] = useState<Mode>("ocr_month")
  const [keyword, setKeyword] = useState("")
  const [exclude, setExclude] = useState("")
  const [dateIn, setDateIn] = useState("")
  const [dateOut, setDateOut] = useState("")
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<GlobalSearchResult | null>(null)
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .searchBounds()
      .then((b) => {
        setBounds(b)
        if (b.earliest_datetime && b.latest_datetime) {
          // prefer datetime strings from API
          setDateIn((b.earliest_datetime || "").slice(0, 10))
          setDateOut((b.latest_datetime || "").slice(0, 10))
        } else if (b.earliest_ts && b.latest_ts) {
          setDateIn(tsToDateInput(b.earliest_ts))
          setDateOut(tsToDateInput(b.latest_ts))
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const modes = useMemo(() => {
    const list: { id: Mode; label: string }[] = [
      { id: "ocr_month", label: t("gs_option_ocr_text_search_month_range") },
      { id: "ocr_exact", label: t("gs_option_ocr_text_search_exact_date") },
    ]
    return list
  }, [t])

  const runSearch = useCallback(
    async (pageIndex = 1) => {
      if (!dateIn || !dateOut) return
      setLoading(true)
      setError(null)
      try {
        const res = await api.searchOcr({
          keyword,
          exclude,
          date_in: dateInputToIsoStart(dateIn),
          date_out: dateInputToIsoEnd(dateOut),
          page_index: pageIndex,
        })
        setResult(res)
        setPage(pageIndex)
        setSelected(0)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [dateIn, dateOut, exclude, keyword, t],
  )

  const hit: GlobalSearchHit | null =
    result && result.hits.length > 0 ? result.hits[Math.min(selected, result.hits.length - 1)] : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        titleKey="gs_md_search_title"
        badge={<Badge variant="secondary">Search</Badge>}
        description={<span className="inline-flex items-center gap-1"><Search className="size-3.5" /> WebUI Next</span>}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("webui_error")}</AlertTitle>
          <AlertDescription className="break-all">{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("text_search_keyword")}</CardTitle>
          <CardDescription>{t("gs_text_intro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {modes.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={mode === m.id ? "default" : "outline"}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder={t("text_search_keyword")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch(1)
              }}
            />
            <Input
              placeholder={t("gs_input_exclude")}
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
            />
            <Input type="date" value={dateIn} onChange={(e) => setDateIn(e.target.value)} />
            <Input type="date" value={dateOut} onChange={(e) => setDateOut(e.target.value)} />
          </div>

          {bounds && bounds.earliest_ts > 0 && bounds.latest_ts > bounds.earliest_ts ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("text_search_daterange")}</p>
              <Slider
                min={bounds.earliest_ts}
                max={bounds.latest_ts}
                step={86400}
                value={[
                  Math.max(bounds.earliest_ts, Math.floor(new Date(`${dateIn}T00:00:00Z`).getTime() / 1000) || bounds.earliest_ts),
                  Math.min(bounds.latest_ts, Math.floor(new Date(`${dateOut}T00:00:00Z`).getTime() / 1000) || bounds.latest_ts),
                ]}
                onValueChange={(v) => {
                  const arr = Array.isArray(v) ? v : [v]
                  if (arr[0] != null) setDateIn(tsToDateInput(Number(arr[0])))
                  if (arr[1] != null) setDateOut(tsToDateInput(Number(arr[1])))
                }}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void runSearch(1)} disabled={loading}>
              {loading ? t("gs_text_searching") : t("text_search_keyword")}
            </Button>
            {result ? (
              <I18nMarkdown
                k="gs_md_search_result_stat"
                vars={{
                  all_result_counts: result.total,
                  max_page_count: result.max_page,
                  search_content: result.query || keyword || "",
                }}
                variant="muted"
                className="inline-flex items-center gap-1"
              />
            ) : null}
            {result ? <span className="text-sm text-muted-foreground">· {result.time_cost}s</span> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="min-h-80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <I18nMarkdown
                k="gs_md_search_result_below"
                vars={{ timecost: result?.time_cost ?? "" }}
                variant="sectionTitle"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !result ? <Skeleton className="h-64 w-full" /> : null}
            {result && result.hits.length === 0 ? (
              <Alert>
                <AlertTitle>{t("text_search_not_found", { search_content: keyword })}</AlertTitle>
              </Alert>
            ) : null}
            <ScrollArea className="h-[28rem] pr-2">
              <ul className="space-y-2">
                {result?.hits.map((h) => (
                  <li key={`${h.index}-${h.ts}`}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-lg border p-2 text-left text-sm hover:bg-muted",
                        selected === h.index && "border-primary bg-muted",
                      )}
                      onClick={() => setSelected(h.index)}
                    >
                      <div className="flex gap-2">
                        {h.thumbnail ? (
                          <img
                            src={
                              h.thumbnail.startsWith("data:")
                                ? h.thumbnail
                                : `data:image/jpeg;base64,${h.thumbnail}`
                            }
                            alt=""
                            className="h-12 w-16 rounded object-cover"
                          />
                        ) : (
                          <div className="h-12 w-16 rounded bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs text-muted-foreground">
                            {formatDateTime(h.datetime) || formatClock(h.datetime)}
                          </div>
                          <div className="line-clamp-1 font-medium">{h.win_title || h.videofile_name}</div>
                          <div className="line-clamp-2 text-xs text-muted-foreground">
                            {highlightOcrText(h.ocr_text, keyword, highlightOn)}
                          </div>
                        </div>
                        <Badge variant={h.video_on_disk ? "secondary" : "outline"}>
                          {h.video_on_disk ? t("webui_badge_video") : t("webui_badge_text")}
                        </Badge>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
            {result && result.max_page > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => void runSearch(page - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm">
                  {page}/{result.max_page}
                </span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={page >= result.max_page || loading}
                  onClick={() => void runSearch(page + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-h-80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("gs_slider_to_rewind_result")}</CardTitle>
            <CardDescription>{hit?.videofile_name || hit?.win_title || "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hit?.video_url ? (
              <video
                key={`${hit.video_url}-${hit.start_seconds ?? 0}`}
                className="aspect-video w-full rounded-lg bg-black object-contain"
                src={`${hit.video_url}#t=${Math.max(0, hit.start_seconds ?? 0)}`}
                controls
                controlsList="nodownload"
                preload="metadata"
                playsInline
                autoPlay
              />
            ) : hit ? (
              <Alert>
                <AlertTitle>
                  <I18nMarkdown
                    k="gs_text_video_file_not_on_disk"
                    vars={{ df_videofile_name: hit.videofile_name || "" }}
                    variant="inherit"
                    as="span"
                  />
                </AlertTitle>
                <AlertDescription className="line-clamp-8 text-xs">
                  {highlightOcrText(hit.ocr_text, keyword, highlightOn)}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                {t("gs_text_intro")}
              </div>
            )}
            {hit?.deep_linking ? (
              <a className="text-sm text-primary underline" href={hit.deep_linking} target="_blank" rel="noreferrer">
                {hit.deep_linking}
              </a>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
