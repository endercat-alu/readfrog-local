import type { ThemeMode } from "@/types/config/theme"
import { Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import * as React from "react"
import ReactDOM from "react-dom/client"
import FrogToast from "@/components/frog-toast"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { baseThemeModeAtom } from "@/utils/atoms/theme"
import { getLocalThemeMode } from "@/utils/theme"
import App from "./app"
import "@/assets/styles/theme.css"
import "./style.css"

function HydrateAtoms({
  initialValues,
  children,
}: {
  initialValues: [[typeof baseThemeModeAtom, ThemeMode]]
  children: React.ReactNode
}) {
  useHydrateAtoms(initialValues)
  return children
}

async function initApp() {
  const root = document.getElementById("root")!
  root.className = "antialiased bg-background text-foreground"
  const themeMode = await getLocalThemeMode()

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <JotaiProvider>
        <HydrateAtoms initialValues={[[baseThemeModeAtom, themeMode]]}>
          <ThemeProvider>
            <FrogToast />
            <App />
          </ThemeProvider>
        </HydrateAtoms>
      </JotaiProvider>
    </React.StrictMode>,
  )
}

void initApp()
