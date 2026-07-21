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
export type WintitleStat = {
  date: string
  items: WintitleItem[]
  screentime_sum_seconds?: number
  screentime_sum?: string
}

export type PublicConfig = {
  version: string
  lang: string
  webui_backend: string
  record_mode: string
  day_begin_minutes: number
  max_page_result: number
  enable_3_columns_in_oneday: boolean
  enable_ocr_str_highlight_indicator: boolean
  record_deep_linking: boolean
  webui_password_enabled: boolean
  OCR_index_strategy?: number
}

export type FooterState = Record<string, string | number | boolean | null | undefined>

export type SearchBounds = {
  earliest_ts: number
  latest_ts: number
  earliest_datetime: string | null
  latest_datetime: string | null
  max_page_result: number
  enable_img_embed?: boolean
  enable_synonyms?: boolean
  img_embed_module_install?: boolean
}

export type DbStatus = {
  video_count: number
  unindexed_count: number
  OCR_index_strategy: number
  estimate_indexing_time: string
  is_recording: boolean
  level?: string
  message_key?: string
  manual_update_available?: boolean
  update_job?: {
    running: boolean
    ok: boolean | null
    error: string | null
    time_cost_seconds: number | null
    shutdown_after?: boolean
  }
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
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`)
  }
  return res.json() as Promise<T>
}

async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form, credentials: "include" })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`)
  }
  return res.json() as Promise<T>
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => getJson<{ ok: boolean; version: string; lang: string }>("/api/health"),
  authStatus: () =>
    getJson<{ password_enabled: boolean; authenticated: boolean }>("/api/auth/status"),
  authLogin: (password: string) => {
    const form = new FormData()
    form.set("password", password)
    return postForm<{ ok: boolean; authenticated: boolean; token?: string }>("/api/auth/login", form)
  },
  authLogout: () => postForm<{ ok: boolean }>("/api/auth/logout", new FormData()),
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
    postJson<{ ok: boolean; applied: string[] }>("/api/recording/save", payload),
  settingOptions: () => getJson<Record<string, unknown>>("/api/setting/options"),
  settingSave: (payload: Record<string, unknown>) =>
    postJson<{ ok: boolean; applied: string[] }>("/api/setting/save", payload),
  settingDbStatus: () => getJson<DbStatus>("/api/setting/db-status"),
  settingUpdateDb: (shutdown_after = false) => {
    const form = new FormData()
    form.set("shutdown_after", shutdown_after ? "true" : "false")
    return postForm<{
      ok: boolean
      started?: boolean
      error?: string
      estimate_indexing_time?: string
      job?: DbStatus["update_job"]
    }>("/api/setting/update-db", form)
  },
  settingUpdateDbStatus: () =>
    getJson<{
      running: boolean
      ok: boolean | null
      error: string | null
      time_cost_seconds: number | null
      started_at: number | null
      finished_at: number | null
    }>("/api/setting/update-db/status"),
  settingAbout: () =>
    getJson<{ version: string; new_version: string | null; about_markdown: string }>("/api/setting/about"),
  settingClearDataPreview: () =>
    getJson<{
      permanent: boolean
      is_recording: boolean
      scopes: Record<
        string,
        {
          id: string
          label_key: string
          path_hint: string
          file_count: number
          byte_size: number
          human_size: string
          exists: boolean
          target_count: number
        }
      >
      total_if_all: { file_count: number; byte_size: number; human_size: string }
    }>("/api/setting/clear-data/preview"),
  settingClearData: (scopes: string[]) =>
    postJson<{
      ok: boolean
      error?: string
      detail?: string
      deleted?: { path: string; scope: string; ok: boolean }[]
      failed?: { path: string; scope: string; error: string }[]
      deleted_count?: number
      failed_count?: number
      permanent?: boolean
    }>("/api/setting/clear-data", { scopes, confirm: true }),
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
