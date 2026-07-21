import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react"

import {
  api,
  formatClock,
  formatDateTime,
  shiftDate,
  type DayChart,
  type DayMeta,
  type DaySearch,
  type FlagItem,
  type LocateResult,
  type Timeline,
  type WintitleStat,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function ActivitySpark({ points }: { points: DayChart["points"] }) {
  const max = Math.max(1, ...points.map((p) => p.data))
  return (
    <div className="flex h-16 w-full items-end gap-px overflow-hidden rounded-md bg-muted/40 px-1 py-1">
      {points.map((p) => (
        <div
          key={`${p.ts}-${p.hour}`}
          title={`${formatClock(p.hour)} · ${p.data}`}
          className="min-w-0 flex-1 rounded-sm bg-primary/70 transition-all"
          style={{ height: `${Math.max(6, (p.data / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function OnedayPage() {
  const t = useT()
  const { config } = useI18n()
  const highlightOn = Boolean(config?.enable_ocr_str_highlight_indicator)
  const [date, setDate] = useState<string>("")
  const [meta, setMeta] = useState<DayMeta | null>(null)
  const [chart, setChart] = useState<DayChart | null>(null)
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [wintitle, setWintitle] = useState<WintitleStat | null>(null)
  const [locate, setLocate] = useState<LocateResult | null>(null)
  const [cursorTs, setCursorTs] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [locateLoading, setLocateLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchOn, setSearchOn] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [search, setSearch] = useState<DaySearch | null>(null)
  const [hitIndex, setHitIndex] = useState(0)
  const [flagsOpen, setFlagsOpen] = useState(false)
  const [flags, setFlags] = useState<FlagItem[]>([])
  const [flagsLoading, setFlagsLoading] = useState(false)
  const [flagNotes, setFlagNotes] = useState<Record<string, string>>({})
  const [flagBusy, setFlagBusy] = useState(false)

  const reloadFlags = useCallback(async (d: string) => {
    if (!d) return
    setFlagsLoading(true)
    try {
      const res = await api.flagsList(d)
      setFlags(res.items || [])
      const notes: Record<string, string> = {}
      for (const it of res.items || []) {
        notes[it.datetime] = it.note === "_" ? "" : it.note
      }
      setFlagNotes(notes)
    } catch {
      setFlags([])
    } finally {
      setFlagsLoading(false)
    }
  }, [])

  useEffect(() => {
    api
      .defaultDate()
      .then((r) => setDate(r.date))
      .catch((e: Error) => setError(e.message))
  }, [])

  const loadDay = useCallback(async (d: string) => {
    if (!d) return
    setLoading(true)
    setError(null)
    try {
      const [m, c, t, w] = await Promise.all([
        api.dayMeta(d),
        api.dayChart(d),
        api.dayTimeline(d),
        api.wintitle(d).catch(() => ({ date: d, items: [] }) as WintitleStat),
      ])
      setMeta(m)
      setChart(c)
      setTimeline(t)
      setWintitle(w)
      if (m.has_data && m.min_ts != null && m.max_ts != null) {
        setCursorTs(m.max_ts)
      } else {
        setCursorTs(null)
        setLocate(null)
      }
      setSearch(null)
      setHitIndex(0)
      void reloadFlags(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [reloadFlags])

  useEffect(() => {
    if (date) void loadDay(date)
  }, [date, loadDay])

  const range = useMemo(() => {
    if (meta?.min_ts == null || meta?.max_ts == null) return null
    return { min: meta.min_ts, max: meta.max_ts }
  }, [meta])

  const locateAt = useCallback(async (ts: number) => {
    setLocateLoading(true)
    try {
      const result = await api.locateByTs(ts)
      setLocate(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocateLoading(false)
    }
  }, [])

  useEffect(() => {
    if (cursorTs == null || searchOn) return
    const handle = window.setTimeout(() => {
      void locateAt(cursorTs)
    }, 250)
    return () => window.clearTimeout(handle)
  }, [cursorTs, locateAt, searchOn])

  const runSearch = useCallback(async () => {
    if (!date) return
    setLocateLoading(true)
    try {
      const res = await api.search(date, keyword.trim())
      setSearch(res)
      setHitIndex(0)
      if (res.hits.length > 0) {
        setCursorTs(res.hits[0].ts)
        await locateAt(res.hits[0].ts)
      } else {
        setLocate(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocateLoading(false)
    }
  }, [date, keyword, locateAt])

  useEffect(() => {
    if (!searchOn || !search?.hits.length) return
    const hit = search.hits[hitIndex]
    if (!hit) return
    setCursorTs(hit.ts)
    void locateAt(hit.ts)
  }, [hitIndex, search, searchOn, locateAt])

  const sliderValue = cursorTs != null && range ? [cursorTs] : range ? [range.max] : [0]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        titleKey="oneday_title"
        badge={<Badge variant="secondary">Oneday</Badge>}
        description={
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" /> {t("tab_name_oneday")} · WebUI Next
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDate((d) => shiftDate(d, -1))} disabled={!date}>
              <ChevronLeft className="size-4" />
              {t("oneday_btn_yesterday")}
            </Button>
            <Input type="date" className="w-[10.5rem]" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => setDate((d) => shiftDate(d, 1))} disabled={!date}>
              {t("oneday_btn_tomorrow")}
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const now = new Date()
                const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
                setDate(iso)
              }}
            >
              {t("oneday_btn_today")}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => date && void loadDay(date)} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("gs_text_intro")}</AlertTitle>
          <AlertDescription className="break-all">{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                <I18nMarkdown k="oneday_title" variant="sectionTitle" />
              </CardTitle>
              <CardDescription>
                {meta?.has_data
                  ? `${formatClock(meta.min_datetime)} — ${formatClock(meta.max_datetime)} · ${meta.result_count}`
                  : t("oneday_text_vid_and_data_not_found")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!locate?.datetime || flagBusy}
                onClick={async () => {
                  if (!locate?.datetime) return
                  setFlagBusy(true)
                  setError(null)
                  try {
                    await api.flagsAdd(locate.datetime)
                    await reloadFlags(date)
                    // 刷新时间轴以显示旗标
                    const tl = await api.dayTimeline(date)
                    setTimeline(tl)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  } finally {
                    setFlagBusy(false)
                  }
                }}
              >
                🚩 {t("oneday_btn_add_flag_mark_from_select_time")}
              </Button>
              <Button
                size="sm"
                variant={flagsOpen ? "default" : "outline"}
                onClick={() => {
                  setFlagsOpen(true)
                  void reloadFlags(date)
                }}
              >
                {t("oneday_toggle_flag_mark")}
              </Button>
              <Button size="sm" variant={searchOn ? "default" : "outline"} onClick={() => setSearchOn((v) => !v)}>
                <Search className="size-4" />
                {t("oneday_toggle_search")}
              </Button>
              {searchOn && (
                <>
                  <Input
                    className="w-44"
                    placeholder={t("text_search_keyword")}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void runSearch()
                    }}
                  />
                  <Button size="sm" onClick={() => void runSearch()}>
                    {t("text_search_keyword")}
                  </Button>
                  {search && search.total > 0 && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        disabled={hitIndex <= 0}
                        onClick={() => setHitIndex((i) => Math.max(0, i - 1))}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span>
                        {hitIndex + 1}/{search.total}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        disabled={hitIndex >= search.total - 1}
                        onClick={() => setHitIndex((i) => Math.min(search.total - 1, i + 1))}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !meta ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {timeline?.available && timeline.image_url ? (
                <img
                  src={timeline.image_url}
                  alt="day timeline"
                  className="max-h-28 w-full rounded-md object-cover object-left"
                />
              ) : (
                <div className="flex h-16 items-center justify-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                  <I18nMarkdown k="oneday_md_no_enough_thunmbnail_for_timeline" variant="muted" />
                </div>
              )}

              {chart && chart.points.length > 0 && <ActivitySpark points={chart.points} />}

              {range && cursorTs != null ? (
                <div className="space-y-2">
                  <Slider
                    min={range.min}
                    max={Math.max(range.min + 1, range.max)}
                    step={30}
                    value={sliderValue}
                    disabled={searchOn}
                    onValueChange={(v) => {
                      const next = Array.isArray(v) ? Number(v[0]) : Number(v)
                      setCursorTs(next)
                    }}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatClock(meta?.min_datetime)}</span>
                    <span className="font-medium text-foreground">
                      {locate?.datetime ? formatDateTime(locate.datetime) : formatDateTime(meta?.max_datetime)}
                      {locateLoading ? " · 定位中…" : ""}
                    </span>
                    <span>{formatClock(meta?.max_datetime)}</span>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertTitle>{t("oneday_text_vid_and_data_not_found")}</AlertTitle>
                  <AlertDescription>
                    {meta?.has_video_on_disk
                      ? t("oneday_text_has_vid_but_not_index")
                      : meta?.is_indexing
                        ? t("oneday_text_data_indexing_wait_and_refresh")
                        : t("oneday_text_vid_and_data_not_found")}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div
        className={cn(
          "grid gap-4",
          meta?.enable_3_columns ? "lg:grid-cols-[1fr_2fr_1fr]" : "lg:grid-cols-[1fr_2fr]",
        )}
      >
        <Card className="min-h-64">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <I18nMarkdown k="oneday_ls_title_wintitle" variant="sectionTitle" />
            </CardTitle>
            <CardDescription title={t("oneday_wt_help")}>{t("oneday_wt_help")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {wintitle && wintitle.items.length > 0 ? (
              <ScrollArea className="h-[28rem] px-4 pb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {/* Streamlit: Page column labeled as oneday_wt_text + total */}
                      <TableHead className="w-[72%]" title={t("oneday_wt_help")}>
                        {t("oneday_wt_text")}
                        {wintitle.screentime_sum ? `   -   ${wintitle.screentime_sum}` : ""}
                      </TableHead>
                      {/* DataFrame second column name is fixed "Screen Time" in backend */}
                      <TableHead className="text-right">Screen Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wintitle.items.map((item) => (
                      <TableRow key={item.page}>
                        <TableCell className="max-w-0 whitespace-normal break-words font-normal">
                          {item.page}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {item.screen_time}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="px-4 pb-4">
                <I18nMarkdown k="oneday_ls_text_no_wintitle_stat" variant="muted" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-64">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <I18nMarkdown k="oneday_title" variant="sectionTitle" />
            </CardTitle>
            <CardDescription>
              {locate?.video_filename
                ? locate.video_filename
                : locate?.kind === "screenshot"
                  ? "screenshot"
                  : locate?.message || t("oneday_text_no_found_record_and_vid_on_disk")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {locateLoading && !locate ? <Skeleton className="aspect-video w-full" /> : null}

            {locate?.kind === "video" && locate.video_url ? (
              <video
                key={`${locate.video_url}-${locate.start_seconds ?? 0}`}
                className="aspect-video w-full rounded-lg bg-black object-contain"
                src={`${locate.video_url}#t=${Math.max(0, locate.start_seconds ?? 0)}`}
                controls
                controlsList="nodownload"
                preload="metadata"
                playsInline
                autoPlay
              />
            ) : null}

            {locate?.kind === "screenshot" && locate.screenshot_url ? (
              <img
                src={locate.screenshot_url}
                alt="screenshot recall"
                className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"
              />
            ) : null}

            {locate?.kind === "row" && (
              <Alert>
                <AlertTitle>{t("oneday_text_not_found_vid_but_has_data")}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{String(locate.row?.win_title ?? "")}</p>
                  <p className="line-clamp-6 text-xs text-muted-foreground">
                    {highlightOcrText(String(locate.row?.ocr_text ?? ""), keyword, highlightOn && searchOn)}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {(locate?.kind === "empty" || locate?.kind === "indexing") && (
              <Alert>
                <AlertTitle>
                  {locate.kind === "indexing"
                    ? t("oneday_text_data_indexing_wait_and_refresh")
                    : t("oneday_text_no_found_record_and_vid_on_disk")}
                </AlertTitle>
                <AlertDescription>{locate.message}</AlertDescription>
              </Alert>
            )}

            {locate?.deep_linking ? (
              <div className="text-sm">
                <Separator className="mb-2" />
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={locate.deep_linking}
                  target="_blank"
                  rel="noreferrer"
                >
                  {locate.deep_linking}
                </a>
              </div>
            ) : null}

            {searchOn && search && search.hits.length > 0 ? (
              <div className="space-y-2">
                <Separator />
                <I18nMarkdown k="gs_md_search_result_below" vars={{ timecost: "" }} variant="muted" className="text-xs font-medium" />
                <ScrollArea className="h-40">
                  <ul className="space-y-1">
                    {search.hits.map((hit) => (
                      <li key={hit.index}>
                        <button
                          type="button"
                          className={cn(
                            "w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                            hit.index === hitIndex && "bg-muted",
                          )}
                          onClick={() => setHitIndex(hit.index)}
                        >
                          <span className="font-mono text-muted-foreground">{formatClock(hit.datetime)}</span>{" "}
                          <span className="line-clamp-1">
                            {hit.win_title ||
                              highlightOcrText(hit.ocr_text, keyword, highlightOn) ||
                              hit.videofile_name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={flagsOpen} onOpenChange={setFlagsOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("oneday_ls_title_flag_note")}</DialogTitle>
            <DialogDescription>{t("oneday_text_flag_mark_help")}</DialogDescription>
          </DialogHeader>
          {flagsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("oneday_text_flag_mark_help")}</p>
          ) : (
            <ScrollArea className="max-h-80">
              <ul className="space-y-3 pr-2">
                {flags.map((f) => (
                  <li key={f.datetime} className="rounded-lg border p-2 text-sm">
                    <div className="mb-1 font-mono text-xs text-muted-foreground">{f.datetime}</div>
                    <Input
                      value={flagNotes[f.datetime] ?? ""}
                      placeholder="note"
                      onChange={(e) =>
                        setFlagNotes((prev) => ({ ...prev, [f.datetime]: e.target.value }))
                      }
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={flagBusy}
                        onClick={async () => {
                          setFlagBusy(true)
                          try {
                            await api.flagsUpdate(f.datetime, flagNotes[f.datetime] ?? "")
                            await reloadFlags(date)
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e))
                          } finally {
                            setFlagBusy(false)
                          }
                        }}
                      >
                        {t("oneday_btn_flag_mark_save_df")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={flagBusy}
                        onClick={async () => {
                          setFlagBusy(true)
                          try {
                            await api.flagsDelete(f.datetime)
                            await reloadFlags(date)
                            const tl = await api.dayTimeline(date)
                            setTimeline(tl)
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e))
                          } finally {
                            setFlagBusy(false)
                          }
                        }}
                      >
                        删除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFlagsOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default OnedayPage
