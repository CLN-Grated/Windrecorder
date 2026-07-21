import { useCallback, useEffect, useState, type ReactNode } from "react"

import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

export function AuthGate({ children }: { children: ReactNode }) {
  const t = useT()
  const [checking, setChecking] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const s = await api.authStatus()
      setNeedsLogin(Boolean(s.password_enabled && !s.authenticated))
      setError(null)
    } catch (e) {
      // If auth status fails hard, still allow shell to show network error later
      setNeedsLogin(false)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await api.authLogin(password)
      setPassword("")
      setNeedsLogin(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Skeleton className="h-40 w-full max-w-md" />
      </div>
    )
  }

  if (needsLogin) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">🔒 Password</CardTitle>
            <CardDescription>{t("set_pwd_help")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>{t("webui_error")}</AlertTitle>
                <AlertDescription className="break-all">{error}</AlertDescription>
              </Alert>
            ) : null}
            <Input
              type="password"
              autoFocus
              value={password}
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void login()
              }}
            />
            <Button className="w-full" onClick={() => void login()} disabled={submitting || !password}>
              {submitting ? "..." : "Login"}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
