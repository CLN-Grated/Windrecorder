import { useEffect, useRef } from "react"

import { useAuthMediaSrc } from "@/lib/use-auth-media"
import { cn } from "@/lib/utils"

export function AuthMediaImg({
  src,
  alt,
  className,
}: {
  src: string | null | undefined
  alt: string
  className?: string
}) {
  const resolved = useAuthMediaSrc(src)
  if (!resolved) return null
  return <img src={resolved} alt={alt} className={className} />
}

export function AuthMediaVideo({
  src,
  startSeconds = 0,
  className,
  autoPlay,
}: {
  src: string | null | undefined
  startSeconds?: number
  className?: string
  autoPlay?: boolean
}) {
  const resolved = useAuthMediaSrc(src)
  const ref = useRef<HTMLVideoElement>(null)
  const t = Math.max(0, startSeconds)

  useEffect(() => {
    const el = ref.current
    if (!el || !resolved) return
    const onMeta = () => {
      try {
        if (t > 0 && Number.isFinite(t)) el.currentTime = t
      } catch {
        /* ignore seek errors */
      }
    }
    el.addEventListener("loadedmetadata", onMeta)
    return () => el.removeEventListener("loadedmetadata", onMeta)
  }, [resolved, t])

  if (!resolved) return null
  return (
    <video
      ref={ref}
      key={`${resolved}-${t}`}
      className={cn(className)}
      src={resolved}
      controls
      controlsList="nodownload"
      preload="metadata"
      playsInline
      autoPlay={autoPlay}
    />
  )
}
