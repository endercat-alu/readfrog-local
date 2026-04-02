import "@/utils/zod-config"
import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { Config } from "@/types/config/config"
import type { ThemeMode } from "@/types/config/theme"
import { createShadowRootUi, defineContentScript, storage } from "#imports"
import { kebabCase } from "case-anything"
import { Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import ReactDOM from "react-dom/client"
// import eruda from 'eruda'
import { ThemeProvider } from "@/components/providers/theme-provider"
import { baseThemeModeAtom } from "@/utils/atoms/theme"
import { getLocalConfig } from "@/utils/config/storage"
import { APP_NAME } from "@/utils/constants/app"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, DETECTED_CODE_STORAGE_KEY } from "@/utils/constants/config"
import { getDocumentInfo } from "@/utils/content/analyze"
import { shouldProcessAutoPageRulesForUrl } from "@/utils/host/translate/page-rules"
import { logger } from "@/utils/logger"
import { onMessage, sendMessage } from "@/utils/message"
import { protectSelectAllShadowRoot } from "@/utils/select-all"
import { insertShadowRootUIWrapperInto } from "@/utils/shadow-root"
import { clearEffectiveSiteControlUrl, getEffectiveSiteControlUrl, isSiteEnabled } from "@/utils/site-control"
import { addStyleToShadow, injectBaseStylesToShadow } from "@/utils/styles"
import { getLocalThemeMode } from "@/utils/theme"
import App from "./app"
import { bindTranslationShortcutKey } from "./translation-control/bind-translation-shortcut"
import { handleTranslationModeChange } from "./translation-control/handle-config-change"
import { registerNodeTranslationTriggers } from "./translation-control/node-translation"
import { PageTranslationManager } from "./translation-control/page-translation"
import { setCacheHitDebugEnabled } from "@/utils/host/translate/cache-hit-debug"
import "@/utils/crypto-polyfill"
import "./listen"

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

declare global {
  interface Window {
    __READ_FROG_HOST_INJECTED__?: boolean
  }
}

export default defineContentScript({
  matches: ["*://*/*", "file:///*"],
  cssInjectionMode: "manifest",
  allFrames: true,
  // Firefox uses runtime registration here to avoid shipping an always-on
  // manifest content script across every granted page and iframe.
  registration: {
    chrome: "manifest",
    edge: "manifest",
    firefox: "runtime",
  },
  async main(ctx) {
    // Prevent double injection (manifest-based + programmatic injection)
    if (window.__READ_FROG_HOST_INJECTED__)
      return
    window.__READ_FROG_HOST_INJECTED__ = true

    ctx.onInvalidated(() => {
      window.__READ_FROG_HOST_INJECTED__ = false
      clearEffectiveSiteControlUrl()
    })

    // Check global site control
    const initialConfig = await getLocalConfig()
    const siteControlUrl = getEffectiveSiteControlUrl(window.location.href)
    if (!isSiteEnabled(siteControlUrl, initialConfig)) {
      window.__READ_FROG_HOST_INJECTED__ = false
      clearEffectiveSiteControlUrl()
      return
    }

    // eruda.init()

    const themeMode = await getLocalThemeMode()

    const ui = await createShadowRootUi(ctx, {
      name: `${kebabCase(APP_NAME)}-selection`,
      position: "overlay",
      anchor: "body",
      onMount: (container, shadow, shadowHost) => {
        // Container is a body, and React warns when creating a root on the body, so create a wrapper div
        const wrapper = insertShadowRootUIWrapperInto(container)
        injectBaseStylesToShadow(shadow)
        addStyleToShadow(shadow)
        protectSelectAllShadowRoot(shadowHost, wrapper)

        // Create a root on the UI container and render a component
        const root = ReactDOM.createRoot(wrapper)
        root.render(
          <JotaiProvider>
            <HydrateAtoms initialValues={[[baseThemeModeAtom, themeMode]]}>
              <ThemeProvider container={wrapper}>
                <App />
              </ThemeProvider>
            </HydrateAtoms>
          </JotaiProvider>,
        )
        return root
      },
      onRemove: (root) => {
        // Unmount the root when the UI is removed
        root?.unmount()
      },
    })

    // 4. Mount the UI
    ui.mount()

    void registerNodeTranslationTriggers()

    const preloadConfig = initialConfig?.translate.page.preload ?? DEFAULT_CONFIG.translate.page.preload
    const manager = new PageTranslationManager({
      root: null,
      rootMargin: `${preloadConfig.margin}px`,
      threshold: preloadConfig.threshold,
    })
    manager.setConfig(initialConfig ?? null)

    // Removed shortcutKeyManager class

    manager.registerPageTranslationTriggers()

    // For late-loading iframes: check if translation is already enabled for this tab
    let translationEnabled = false
    try {
      translationEnabled = await sendMessage("getEnablePageTranslationFromContentScript", undefined)
    }
    catch (error) {
      // Extension context may be invalidated during update, proceed without auto-start
      logger.error("Failed to check translation state:", error)
    }
    if (translationEnabled) {
      void manager.start()
    }

    let cacheHighlightEnabled = false
    try {
      cacheHighlightEnabled = await sendMessage("getCacheHighlightStateFromContentScript", undefined)
    }
    catch (error) {
      logger.error("Failed to check cache highlight state:", error)
    }
    setCacheHitDebugEnabled(cacheHighlightEnabled)

    let latestConfig: Config = initialConfig ?? DEFAULT_CONFIG
    let pendingUrlChangeTimer: number | null = null
    let urlChangeVersion = 0

    const shouldProcessAutoTranslationForUrl = (url: string) => {
      return shouldProcessAutoPageRulesForUrl(url, latestConfig)
    }

    const scheduleUrlChangeWork = (to: string) => {
      if (!manager.isActive && !shouldProcessAutoTranslationForUrl(to))
        return

      urlChangeVersion += 1
      const currentVersion = urlChangeVersion

      if (pendingUrlChangeTimer !== null) {
        window.clearTimeout(pendingUrlChangeTimer)
      }

      pendingUrlChangeTimer = window.setTimeout(async () => {
        if (currentVersion !== urlChangeVersion || window !== window.top)
          return

        const { detectedCodeOrUnd } = await getDocumentInfo()
        const detectedCode: LangCodeISO6393 = detectedCodeOrUnd === "und" ? "eng" : detectedCodeOrUnd
        await storage.setItem<LangCodeISO6393>(`local:${DETECTED_CODE_STORAGE_KEY}`, detectedCode)

        if (!manager.isActive) {
          void sendMessage("checkAndAskAutoPageTranslation", { url: to, detectedCodeOrUnd })
        }
      }, 350)
    }

    const handleUrlChange = async (from: string, to: string) => {
      if (from !== to) {
        logger.info("URL changed from", from, "to", to)
        if (manager.isActive) {
          manager.refreshForNavigation()
        }

        scheduleUrlChangeWork(to)
      }
    }

    window.addEventListener("extension:URLChange", (e: any) => {
      const { from, to } = e.detail
      void handleUrlChange(from, to)
    })

    void bindTranslationShortcutKey(manager)

    // This may not work when the tab is not active, if so, need refresh the webpage
    storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, (newConfig, oldConfig) => {
      if (newConfig) {
        latestConfig = newConfig
      }
      manager.setConfig(newConfig ?? null)
      void bindTranslationShortcutKey(manager)

      // Auto re-translate when translation mode changes while page translation is active
      handleTranslationModeChange(newConfig, oldConfig, manager)
    })

    // Listen for translation state changes from background
    onMessage("askManagerToTogglePageTranslation", (msg) => {
      const { enabled } = msg.data
      if (enabled === manager.isActive)
        return
      enabled ? void manager.start() : manager.stop()
    })

    onMessage("notifyCacheHighlightStateChanged", (msg) => {
      setCacheHitDebugEnabled(msg.data.enabled)
    })

    // Only the top frame should detect and set language to avoid race conditions from iframes
    if (window === window.top) {
      const shouldProcessAutoTranslation = shouldProcessAutoTranslationForUrl(window.location.href)
      if (!shouldProcessAutoTranslation && !translationEnabled)
        return

      const { detectedCodeOrUnd } = await getDocumentInfo()
      const initialDetectedCode: LangCodeISO6393 = detectedCodeOrUnd === "und" ? "eng" : detectedCodeOrUnd
      await storage.setItem<LangCodeISO6393>(`local:${DETECTED_CODE_STORAGE_KEY}`, initialDetectedCode)

      // Check if auto-translation should be enabled for initial page load
      if (!translationEnabled && shouldProcessAutoTranslation) {
        void sendMessage("checkAndAskAutoPageTranslation", { url: window.location.href, detectedCodeOrUnd })
      }
    }
  },
})
