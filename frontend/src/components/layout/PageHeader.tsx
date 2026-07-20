import type { ReactNode } from "react"

import { I18nMarkdown } from "@/components/I18nMarkdown"
import { cn } from "@/lib/utils"

export function PageHeader({
  titleKey,
  descriptionKey,
  description,
  badge,
  actions,
  className,
}: {
  titleKey: string
  descriptionKey?: string
  description?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <I18nMarkdown k={titleKey} variant="pageTitle" />
          {badge}
        </div>
        {descriptionKey ? <I18nMarkdown k={descriptionKey} variant="muted" /> : null}
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
