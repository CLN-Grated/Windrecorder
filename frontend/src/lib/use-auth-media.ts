import { useEffect, useState } from "react"

import { fetchMediaObjectUrl, mediaUrl } from "@/lib/api-base"

/**
 * Resolve /media/* (or relative API media) for <img>/<video>.
 * When Bearer token exists, fetches with Authorization and uses a blob URL
 * (tags cannot set Authorization headers).
 */
export function useAuthMediaSrc(pathOrUrl: string | null | undefined): string {
  const [src, setSrc] = useState("")

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function run() {
      if (!pathOrUrl) {
        setSrc("")
        return
      }
      if (pathOrUrl.startsWith("data:") || pathOrUrl.startsWith("blob:")) {
        setSrc(pathOrUrl)
        return
      }
      try {
        const url = await fetchMediaObjectUrl(pathOrUrl)
        if (cancelled) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url)
          return
        }
        if (url.startsWith("blob:")) objectUrl = url
        setSrc(url)
      } catch {
        if (!cancelled) setSrc(mediaUrl(pathOrUrl))
      }
    }

    void run()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [pathOrUrl])

  return src
}
