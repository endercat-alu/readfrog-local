import { Provider as JotaiProvider } from "jotai"
import * as React from "react"
import ReactDOM from "react-dom/client"
import FrogToast from "@/components/frog-toast"
import { ThemeProvider } from "@/components/providers/theme-provider"
import App from "./app"
import "@/assets/styles/theme.css"
import "./style.css"

function initApp() {
  const root = document.getElementById("root")!
  root.className = "antialiased bg-background text-foreground"

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <JotaiProvider>
        <ThemeProvider>
          <FrogToast />
          <App />
        </ThemeProvider>
      </JotaiProvider>
    </React.StrictMode>,
  )
}

initApp()
