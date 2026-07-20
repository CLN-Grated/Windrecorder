import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { AuthGate } from "@/components/layout/AuthGate"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/lib/i18n"
import { OnedayPage } from "@/pages/OnedayPage"
import RecordingPage from "@/pages/RecordingPage"
import SearchPage from "@/pages/SearchPage"
import SettingPage from "@/pages/SettingPage"
import StatePage from "@/pages/StatePage"

function App() {
  return (
    <TooltipProvider>
      <I18nProvider>
        <BrowserRouter>
          <AuthGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<OnedayPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="state" element={<StatePage />} />
                <Route path="recording" element={<RecordingPage />} />
                <Route path="setting" element={<SettingPage />} />
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
