import { useEffect, useState } from "react"

import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function MediaVideo({
  src,
  startSeconds = 0,
  className,
  autoPlay,
}: {
  src: string
  startSeconds?: number
  className?: string
  autoPlay?: boolean
}) {
  const t = useT()
  const [objectUrl, setObjectUrl] = useState("")
  const [error, setError] = useState("")
  const startTime = Math.max(0, startSeconds)

  useEffect(() => {
    const controller = new AbortController()
    let nextObjectUrl = ""

    setObjectUrl("")
    setError("")

    void fetch(src, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        return response.blob()
      })
      .then((blob) => {
        if (controller.signal.aborted) return
        nextObjectUrl = URL.createObjectURL(blob)
        setObjectUrl(nextObjectUrl)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      controller.abort()
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [src])

  if (error) {
    return (
      <div className={cn("flex items-center justify-center p-4 text-sm text-destructive", className)} role="alert">
        {t("webui_error")}: {error}
      </div>
    )
  }

  if (!objectUrl) {
    return <div className={cn("animate-pulse", className)} aria-busy="true" />
  }

  return (
    <video
      key={`${objectUrl}-${startTime}`}
      className={className}
      src={objectUrl}
      onLoadedMetadata={(event) => {
        if (startTime > 0 && Number.isFinite(startTime)) {
          event.currentTarget.currentTime = startTime
        }
      }}
      controls
      controlsList="nodownload"
      preload="metadata"
      playsInline
      autoPlay={autoPlay}
    />
  )
}
