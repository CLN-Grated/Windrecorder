import { NavLink, Outlet } from "react-router-dom"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { PublicAccessTip } from "@/components/layout/PublicAccessTip"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

const NAV = [
  { to: "/", key: "tab_name_oneday", end: true },
  { to: "/search", key: "tab_name_search" },
  { to: "/state", key: "tab_name_stat" },
  { to: "/recording", key: "tab_name_recording" },
  { to: "/setting", key: "tab_name_setting" },
] as const

export function AppShell() {
  const { t, ready, error, config, lang } = useI18n()

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-lg" aria-hidden>
              🦝
            </span>
            <span className="font-semibold tracking-tight">Windrecorder</span>
            <Badge variant="secondary" className="font-normal">
              WebUI Next
            </Badge>
            {config?.version ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">v{config.version}</span>
            ) : null}
          </div>
          <nav className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto text-sm">
            {!ready ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              NAV.map((item, idx) => (
                <div key={item.to} className="flex items-center gap-1">
                  {idx > 0 ? <Separator orientation="vertical" className="mx-0.5 h-4" /> : null}
                  <NavLink
                    to={item.to}
                    end={"end" in item ? item.end : false}
                    className={({ isActive }) =>
                      cn(
                        "whitespace-nowrap rounded-md px-2 py-1 transition-colors",
                        isActive
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )
                    }
                  >
                    {t(item.key)}
                  </NavLink>
                </div>
              ))
            )}
          </nav>
          <div className="hidden shrink-0 text-xs text-muted-foreground md:block">{lang}</div>
        </div>
      </header>
      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          i18n/config: {error}
        </div>
      ) : null}
      <PublicAccessTip />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
