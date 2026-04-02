import { browser } from "#imports"
import { getLocalConfig } from "@/utils/config/storage"
import { logger } from "@/utils/logger"
import { isSiteEnabled, SITE_CONTROL_URL_WINDOW_KEY } from "@/utils/site-control"
import { resolveSiteControlUrl } from "./iframe-injection-utils"

function getParentFrameIdHint(details: object): number | undefined {
  if ("parentFrameId" in details && typeof details.parentFrameId === "number") {
    return details.parentFrameId
  }

  return undefined
}

function setInjectedSiteControlUrl(propertyName: string, siteControlUrl: string) {
  ;(globalThis as Record<string, unknown>)[propertyName] = siteControlUrl
}

export function setupIframeInjection() {
  // Firefox already handles these frames through runtime registration, so keep
  // the Chrome-only iframe reinjection path out of its hot path.
  if (!["chrome", "edge"].includes(import.meta.env.BROWSER)) {
    return
  }

  // Listen for iframe loads and inject content scripts programmatically
  // This catches iframes that Chrome's manifest-based all_frames: true misses
  // (e.g., dynamically created iframes, sandboxed iframes like edX)
  browser.webNavigation.onCompleted.addListener(async (details) => {
    // Skip main frame (frameId === 0), only handle iframes
    if (details.frameId === 0)
      return

    try {
      const config = await getLocalConfig()
      const frames = await browser.webNavigation.getAllFrames({ tabId: details.tabId }) ?? []
      const siteControlUrl = resolveSiteControlUrl(
        details.frameId,
        details.url,
        frames,
        getParentFrameIdHint(details),
      )

      if (!siteControlUrl || !isSiteEnabled(siteControlUrl, config)) {
        return
      }

      await browser.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        func: setInjectedSiteControlUrl,
        args: [SITE_CONTROL_URL_WINDOW_KEY, siteControlUrl],
      })

      // Inject host.content script into the iframe
      await browser.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        files: ["/content-scripts/host.js"],
      })

      // Inject selection.content script into the iframe
      await browser.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        files: ["/content-scripts/selection.js"],
      })
    }
    catch (error) {
      logger.warn("[Background][IframeInjection] Failed to inject iframe content scripts", error)
    }
  })
}
