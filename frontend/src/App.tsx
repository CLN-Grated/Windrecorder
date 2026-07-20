import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/lib/i18n"
import LabPage from "@/pages/LabPage"
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
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<OnedayPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="state" element={<StatePage />} />
              <Route path="lab" element={<LabPage />} />
              <Route path="recording" element={<RecordingPage />} />
              <Route path="setting" element={<SettingPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    </TooltipProvider>
  )
}

export default App
