import { Suspense, lazy } from "react"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

import type { Variant } from "./I18nMarkdownInner"

const I18nMarkdownInner = lazy(() => import("./I18nMarkdownInner"))

const fallbackVariantClass: Record<Variant, string> = {
  pageTitle: "text-xl font-semibold tracking-tight text-foreground",
  sectionTitle: "text-base font-semibold tracking-tight text-foreground",
  body: "text-sm leading-relaxed text-foreground",
  muted: "text-sm text-muted-foreground",
  inherit: "",
}

type Props = {
  /** i18n key */
  k: string
  vars?: Record<string, string | number>
  className?: string
  variant?: Variant
  /** Allow raw HTML from legacy Streamlit strings (p/br/align). */
  allowHtml?: boolean
  as?: "div" | "span"
}

/**
 * Render an i18n string that may contain Streamlit-era markdown / light HTML.
 * The markdown engine (react-markdown + rehype-raw) is lazy-loaded; before it
 * arrives we render the markdown-stripped plain text so first paint is instant.
 */
export function I18nMarkdown({
  k,
  vars,
  className,
  variant = "body",
  allowHtml = true,
  as = "div",
}: Props) {
  const { tRaw, t } = useI18n()
  const md = tRaw(k, vars)
  const plain = t(k, vars)
  const Comp = as
  return (
    <Suspense fallback={<Comp className={cn(fallbackVariantClass[variant], className)}>{plain}</Comp>}>
      <I18nMarkdownInner content={md} className={className} variant={variant} allowHtml={allowHtml} as={as} />
    </Suspense>
  )
}

/** Render an already-resolved markdown string (e.g. about.md body). */
export function MarkdownBlock({
  content,
  className,
  variant = "body",
  allowHtml = true,
}: {
  content: string
  className?: string
  variant?: Variant
  allowHtml?: boolean
}) {
  return (
    <Suspense fallback={<div className={cn(fallbackVariantClass[variant], className)}>{content}</div>}>
      <I18nMarkdownInner content={content} className={className} variant={variant} allowHtml={allowHtml} as="div" />
    </Suspense>
  )
}
