import { Suspense, lazy } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { AuthGate } from "@/components/layout/AuthGate"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/lib/i18n"

const OnedayPage = lazy(() => import("@/pages/OnedayPage"))
const SearchPage = lazy(() => import("@/pages/SearchPage"))
const StatePage = lazy(() => import("@/pages/StatePage"))
const RecordingPage = lazy(() => import("@/pages/RecordingPage"))
const SettingPage = lazy(() => import("@/pages/SettingPage"))

function RouteFallback() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function App() {
  return (
    <TooltipProvider>
      <I18nProvider>
        <BrowserRouter>
          <AuthGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route
                  index
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <OnedayPage />
                    </Suspense>
                  }
                />
                <Route
                  path="search"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <SearchPage />
                    </Suspense>
                  }
                />
                <Route
                  path="state"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <StatePage />
                    </Suspense>
                  }
                />
                <Route
                  path="recording"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <RecordingPage />
                    </Suspense>
                  }
                />
                <Route
                  path="setting"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <SettingPage />
                    </Suspense>
                  }
                />
                <Route path="lab" element={<Navigate to="/setting" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </AuthGate>
        </BrowserRouter>
      </I18nProvider>
    </TooltipProvider>
  )
}

export default App
