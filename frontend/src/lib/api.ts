export type DayMeta = {
  date: string
  has_data: boolean
  noocred_count: number
  result_count: number
  min_datetime: string | null
  max_datetime: string | null
  min_ts: number | null
  max_ts: number | null
  day_begin_minutes: number
  record_mode: string
  has_video_on_disk: boolean
  is_indexing: boolean
  enable_3_columns: boolean
}

export type ChartPoint = { hour: string; ts: number; data: number }
export type DayChart = { date: string; points: ChartPoint[] }
export type Timeline = { date: string; available: boolean; image_url: string | null }

export type LocateResult = {
  kind: "video" | "screenshot" | "row" | "empty" | "indexing"
  datetime: string
  ts: number
  video_filename?: string | null
  video_url?: string | null
  start_seconds?: number | null
  screenshot_url?: string | null
  deep_linking?: string | null
  row?: Record<string, unknown> | null
  message?: string | null
}

export type SearchHit = {
  index: number
  videofile_time: number
  datetime: string
  ts: number
  videofile_name?: string | null
  win_title?: string | null
  ocr_text?: string | null
  deep_linking?: string | null
  thumbnail?: string | null
  video_on_disk: boolean
}

export type DaySearch = {
  date: string
  query: string
  total: number
  hits: SearchHit[]
}

export type WintitleItem = { page: string; screen_time: string }
export type WintitleStat = { date: string; items: WintitleItem[] }

export type I18nPayload = {
  lang: string
  messages: Record<string, string>
  available: string[]
}

export type PublicConfig = {
  version: string
  lang: string
  webui_backend: string
  record_mode: string
  day_begin_minutes: number
  max_page_result: number
  enable_3_columns_in_oneday: boolean
  enable_img_embed_search: boolean
  img_embed_module_install: boolean
  enable_synonyms_recommend: boolean
  enable_ai_extract_tag: boolean
  enable_ai_day_poem: boolean
  enable_ocr_str_highlight_indicator: boolean
  record_deep_linking: boolean
  webui_password_enabled: boolean
  open_ai_base_url: string
  open_ai_modelname: string
  open_ai_api_key_set: boolean
  open_ai_api_key_masked: string
}

export type FooterState = Record<string, string | number | boolean | null | undefined>

export type SearchBounds = {
  earliest_ts: number
  latest_ts: number
  earliest_datetime: string | null
  latest_datetime: string | null
  max_page_result: number
  enable_img_embed: boolean
  enable_synonyms: boolean
  img_embed_module_install: boolean
}

export type GlobalSearchHit = {
  index: number
  videofile_time: number
  datetime: string | null
  ts: number
  videofile_name?: string | null
  win_title?: string | null
  ocr_text?: string | null
  deep_linking?: string | null
  thumbnail?: string | null
  video_on_disk: boolean
  video_url?: string | null
  start_seconds?: number | null
}

export type GlobalSearchResult = {
  total: number
  max_page: number
  page_index: number
  time_cost: number
  hits: GlobalSearchHit[]
  query?: string
  exclude?: string
  date_in?: string | null
  date_out?: string | null
  mode?: string
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`)
  }
  return res.json() as Promise<T>
}

async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => getJson<{ ok: boolean; version: string; lang: string }>("/api/health"),
  i18n: (lang?: string) =>
    getJson<I18nPayload>(lang ? `/api/i18n?lang=${encodeURIComponent(lang)}` : "/api/i18n"),
  publicConfig: () => getJson<PublicConfig>("/api/config/public"),
  footer: () => getJson<FooterState>("/api/footer"),
  defaultDate: () => getJson<{ date: string }>("/api/oneday/default-date"),
  dayMeta: (date: string) => getJson<DayMeta>(`/api/oneday/meta?date=${encodeURIComponent(date)}`),
  dayChart: (date: string) => getJson<DayChart>(`/api/oneday/chart?date=${encodeURIComponent(date)}`),
  dayTimeline: (date: string) =>
    getJson<Timeline>(`/api/oneday/timeline?date=${encodeURIComponent(date)}`),
  locateByTs: (ts: number) => getJson<LocateResult>(`/api/oneday/locate?ts=${ts}`),
  search: (date: string, q: string) =>
    getJson<DaySearch>(
      `/api/oneday/search?date=${encodeURIComponent(date)}&q=${encodeURIComponent(q)}`,
    ),
  wintitle: (date: string) =>
    getJson<WintitleStat>(`/api/oneday/wintitle?date=${encodeURIComponent(date)}`),
  searchBounds: () => getJson<SearchBounds>("/api/search/bounds"),
  searchOcr: (params: {
    keyword: string
    exclude?: string
    date_in: string
    date_out: string
    page_index?: number
  }) => {
    const form = new FormData()
    form.set("keyword", params.keyword)
    form.set("exclude", params.exclude || "")
    form.set("date_in", params.date_in)
    form.set("date_out", params.date_out)
    form.set("page_index", String(params.page_index ?? 1))
    return postForm<GlobalSearchResult>("/api/search/ocr", form)
  },
  searchImgText: (params: {
    query: string
    date_in: string
    date_out: string
    page_index?: number
  }) => {
    const form = new FormData()
    form.set("query", params.query)
    form.set("date_in", params.date_in)
    form.set("date_out", params.date_out)
    form.set("page_index", String(params.page_index ?? 1))
    return postForm<GlobalSearchResult>("/api/search/img-text", form)
  },
  searchImgSimilar: (params: {
    file: File
    date_in: string
    date_out: string
    page_index?: number
  }) => {
    const form = new FormData()
    form.set("file", params.file)
    form.set("date_in", params.date_in)
    form.set("date_out", params.date_out)
    form.set("page_index", String(params.page_index ?? 1))
    return postForm<GlobalSearchResult>("/api/search/img-similar", form)
  },
  stateRange: () =>
    getJson<{
      earliest_ts: number
      latest_ts: number
      earliest_datetime: string | null
      latest_datetime: string | null
    }>("/api/state/range"),
  monthScatter: (year: number, month: number, force = false) =>
    getJson<{ year: number; month: number; points: { day: number; hours: number; data_count: number }[] }>(
      `/api/state/month-scatter?year=${year}&month=${month}&force=${force ? "true" : "false"}`,
    ),
  yearScatter: (year: number, force = false) =>
    getJson<{ year: number; points: { month: number; day: number; data_count: number }[] }>(
      `/api/state/year-scatter?year=${year}&force=${force ? "true" : "false"}`,
    ),
  stateAssets: (year: number, month: number) =>
    getJson<{ lightbox_url: string | null; wordcloud_url: string | null }>(
      `/api/state/assets?year=${year}&month=${month}`,
    ),
  generateLightbox: (year: number, month: number) => {
    const form = new FormData()
    form.set("year", String(year))
    form.set("month", String(month))
    return postForm<{ ok: boolean; image_url: string | null }>("/api/state/lightbox", form)
  },
  generateWordcloud: (year: number, month: number) => {
    const form = new FormData()
    form.set("year", String(year))
    form.set("month", String(month))
    return postForm<{ ok: boolean; image_url: string | null }>("/api/state/wordcloud", form)
  },
  recordingOptions: () => getJson<Record<string, unknown>>("/api/recording/options"),
  recordingSave: (payload: Record<string, unknown>) =>
    fetch("/api/recording/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<{ ok: boolean; applied: string[] }>
    }),
  settingOptions: () => getJson<Record<string, unknown>>("/api/setting/options"),
  settingSave: (payload: Record<string, unknown>) =>
    fetch("/api/setting/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<{ ok: boolean; applied: string[] }>
    }),
  settingDbStatus: () =>
    getJson<{
      video_count: number
      unindexed_count: number
      OCR_index_strategy: number
      estimate_indexing_time: string
      is_recording: boolean
    }>("/api/setting/db-status"),
  settingAbout: () =>
    getJson<{ version: string; new_version: string | null; about_markdown: string }>("/api/setting/about"),
  labSettings: () => getJson<Record<string, unknown>>("/api/lab/settings"),
  labSave: (payload: Record<string, unknown>) =>
    fetch("/api/lab/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<{ ok: boolean; applied: string[] }>
    }),
  labTestLlm: (params?: { open_ai_base_url?: string; open_ai_api_key?: string; open_ai_modelname?: string }) => {
    const form = new FormData()
    if (params?.open_ai_base_url) form.set("open_ai_base_url", params.open_ai_base_url)
    if (params?.open_ai_api_key) form.set("open_ai_api_key", params.open_ai_api_key)
    if (params?.open_ai_modelname) form.set("open_ai_modelname", params.open_ai_modelname)
    return postForm<{ success: boolean; respond: string }>("/api/lab/test-llm", form)
  },
}

export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Display local wall-clock from backend ISO (naive local datetime string). */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "--:--"
  // Backend sends naive local ISO without timezone; parse as local by stripping Z-like suffixes.
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T")
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return iso
  return `${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ""}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T")
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return iso
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ""}`
}
