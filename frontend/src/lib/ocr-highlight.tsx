import type { ReactNode } from "react"

/** Split query into terms (spaces / hyphens), mirroring Streamlit components highlight. */
export function buildSearchTerms(query: string): string[] {
  const q = (query || "").trim()
  if (!q) return []
  const parts = q.split(/\s+/).filter((t) => t.trim().length > 0)
  const terms: string[] = []
  for (const term of parts) {
    const spaced = term.replace(/-/g, " ")
    const compact = term.replace(/-/g, "")
    if (spaced) terms.push(spaced)
    if (compact && compact !== spaced) terms.push(compact)
  }
  return terms
}

type Interval = [number, number] // inclusive end

function findAllOccurrences(text: string, pattern: string): Interval[] {
  if (!pattern) return []
  const lowerText = text.toLowerCase()
  const lowerPattern = pattern.toLowerCase()
  const out: Interval[] = []
  let start = 0
  while (true) {
    const pos = lowerText.indexOf(lowerPattern, start)
    if (pos === -1) break
    out.push([pos, pos + pattern.length - 1])
    start = pos + 1
  }
  return out
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (!intervals.length) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: Interval[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    const last = merged[merged.length - 1]
    if (cur[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], cur[1])
    } else {
      merged.push([...cur] as Interval)
    }
  }
  return merged
}

/**
 * Render OCR text with keyword highlights as React nodes (no raw HTML → XSS-safe).
 * When disabled or no query/terms, returns plain text.
 */
export function highlightOcrText(
  text: string | null | undefined,
  query: string | null | undefined,
  enabled: boolean,
): ReactNode {
  const full = text ?? ""
  if (!full) return null
  if (!enabled || !query?.trim()) return full

  const terms = buildSearchTerms(query)
  if (!terms.length) return full

  const intervals: Interval[] = []
  for (const term of terms) {
    intervals.push(...findAllOccurrences(full, term))
  }
  const merged = mergeIntervals(intervals)
  if (!merged.length) return full

  const nodes: ReactNode[] = []
  let cursor = 0
  merged.forEach(([start, end], i) => {
    if (cursor < start) {
      nodes.push(full.slice(cursor, start))
    }
    nodes.push(
      <mark
        key={`h-${i}-${start}`}
        className="rounded-sm bg-violet-500/90 px-0.5 font-medium text-white dark:bg-violet-600"
      >
        {full.slice(start, end + 1)}
      </mark>,
    )
    cursor = end + 1
  })
  if (cursor < full.length) {
    nodes.push(full.slice(cursor))
  }
  return nodes
}
