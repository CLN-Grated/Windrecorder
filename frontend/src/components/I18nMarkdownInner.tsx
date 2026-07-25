import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"

import { cn } from "@/lib/utils"

type Variant = "pageTitle" | "sectionTitle" | "body" | "muted" | "inherit"

const variantClass: Record<Variant, string> = {
  pageTitle: "text-xl font-semibold tracking-tight text-foreground [&_p]:m-0 [&_h1]:m-0 [&_h2]:m-0 [&_h3]:m-0 [&_h4]:m-0",
  sectionTitle:
    "text-base font-semibold tracking-tight text-foreground [&_p]:m-0 [&_h1]:m-0 [&_h2]:m-0 [&_h3]:m-0 [&_h4]:m-0",
  body: "text-sm leading-relaxed text-foreground [&_p]:my-1 first:[&_p]:mt-0 last:[&_p]:mb-0",
  muted: "text-sm text-muted-foreground [&_p]:my-1 first:[&_p]:mt-0 last:[&_p]:mb-0",
  inherit: "[&_p]:m-0 [&_h1]:m-0 [&_h2]:m-0 [&_h3]:m-0 [&_h4]:m-0",
}

function headingClass(variant: Variant): string {
  if (variant === "pageTitle") return "text-xl font-semibold tracking-tight"
  if (variant === "sectionTitle") return "text-base font-semibold tracking-tight"
  return "text-sm font-semibold"
}

function buildComponents(variant: Variant): Components {
  const h = headingClass(variant)
  const Heading = ({ children }: { children?: React.ReactNode }) => <span className={h}>{children}</span>

  return {
    h1: Heading,
    h2: Heading,
    h3: Heading,
    h4: Heading,
    h5: Heading,
    h6: Heading,
    p: ({ children }) => <p className={variant === "pageTitle" || variant === "sectionTitle" ? "m-0" : undefined}>{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ children }) => (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
    a: ({ href, children }) => (
      <a href={href} className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
  }
}

type InnerProps = {
  /** Already-resolved markdown string. */
  content: string
  className?: string
  variant?: Variant
  /** Allow raw HTML from legacy Streamlit strings (p/br/align). */
  allowHtml?: boolean
  as?: "div" | "span"
}

/**
 * Inner renderer with react-markdown + rehype-raw statically imported.
 * Loaded on-demand via React.lazy from I18nMarkdown / MarkdownBlock so the
 * markdown engine stays out of the first-screen bundle.
 */
export default function I18nMarkdownInner({
  content,
  className,
  variant = "body",
  allowHtml = true,
  as = "div",
}: InnerProps) {
  const Comp = as
  return (
    <Comp className={cn("i18n-md", variantClass[variant], className)}>
      <ReactMarkdown components={buildComponents(variant)} rehypePlugins={allowHtml ? [rehypeRaw] : []}>
        {content}
      </ReactMarkdown>
    </Comp>
  )
}

export type { Variant }
