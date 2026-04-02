import type { Browser } from "#imports"
import type { Config } from "@/types/config/config"
import { browser, storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { logger } from "@/utils/logger"
import { ensureInitializedConfig } from "./config"

const ALL_SITES_PERMISSION = { origins: ["*://*/*"] }

const FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS = {
  host: "read-frog-firefox-host",
  selection: "read-frog-firefox-selection",
  side: "read-frog-firefox-side",
} as const

type FirefoxRuntimeContentScriptName = keyof typeof FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS
type FirefoxRuntimeContentScriptDefinition = Browser.scripting.RegisteredContentScript & {
  id: string
}

const FIREFOX_RUNTIME_CONTENT_SCRIPTS: Record<
  FirefoxRuntimeContentScriptName,
  FirefoxRuntimeContentScriptDefinition
> = {
  host: {
    id: FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS.host,
    matches: ["*://*/*", "file:///*"],
    js: ["content-scripts/host.js"],
    allFrames: true,
    persistAcrossSessions: false,
  },
  selection: {
    id: FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS.selection,
    matches: ["*://*/*", "file:///*"],
    js: ["content-scripts/selection.js"],
    allFrames: true,
    persistAcrossSessions: false,
  },
  side: {
    id: FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS.side,
    matches: ["*://*/*", "file:///*"],
    js: ["content-scripts/side.js"],
    persistAcrossSessions: false,
  },
}

let syncPromise: Promise<void> = Promise.resolve()

function isFirefoxBuild() {
  return import.meta.env.BROWSER === "firefox"
}

function shouldRegisterSelectionContent(config: Config) {
  return config.selectionToolbar.enabled || config.inputTranslation.enabled
}

function shouldRegisterSideContent(config: Config) {
  return config.floatingButton.enabled
}

function getTargetScriptNames(config: Config): FirefoxRuntimeContentScriptName[] {
  const scriptNames: FirefoxRuntimeContentScriptName[] = ["host"]

  if (shouldRegisterSelectionContent(config)) {
    scriptNames.push("selection")
  }

  if (shouldRegisterSideContent(config)) {
    scriptNames.push("side")
  }

  return scriptNames
}

async function hasAllSitesPermission() {
  try {
    return await browser.permissions.contains(ALL_SITES_PERMISSION)
  }
  catch (error) {
    logger.warn("[Background][FirefoxContentScripts] Failed to query host permission", error)
    return false
  }
}

async function getCurrentConfig() {
  return await ensureInitializedConfig() ?? DEFAULT_CONFIG
}

async function syncFirefoxRuntimeContentScripts(config?: Config | null) {
  if (!isFirefoxBuild()) {
    return
  }

  const currentConfig = config ?? await getCurrentConfig()
  const permissionGranted = await hasAllSitesPermission()
  const registeredScripts = await browser.scripting.getRegisteredContentScripts()
  const managedScriptIds = new Set<string>(Object.values(FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS))
  const managedRegisteredScripts = registeredScripts.filter(script => managedScriptIds.has(script.id))
  const targetScriptNames = permissionGranted ? getTargetScriptNames(currentConfig) : []
  const targetScriptIds = new Set<string>(targetScriptNames.map(name => FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS[name]))
  const scriptIdsToUnregister = managedRegisteredScripts
    .map(script => script.id)
    .filter(id => !targetScriptIds.has(id))

  if (scriptIdsToUnregister.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: scriptIdsToUnregister })
  }

  if (!permissionGranted) {
    return
  }

  const existingScriptIds = new Set<string>(managedRegisteredScripts.map(script => script.id))
  const scriptsToUpdate = targetScriptNames
    .filter(name => existingScriptIds.has(FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS[name]))
    .map(name => FIREFOX_RUNTIME_CONTENT_SCRIPTS[name])
  const scriptsToRegister = targetScriptNames
    .filter(name => !existingScriptIds.has(FIREFOX_RUNTIME_CONTENT_SCRIPT_IDS[name]))
    .map(name => FIREFOX_RUNTIME_CONTENT_SCRIPTS[name])

  if (scriptsToUpdate.length > 0) {
    await browser.scripting.updateContentScripts(scriptsToUpdate)
  }

  if (scriptsToRegister.length > 0) {
    await browser.scripting.registerContentScripts(scriptsToRegister)
  }
}

function queueFirefoxRuntimeContentScriptSync(config?: Config | null) {
  syncPromise = syncPromise
    .then(() => syncFirefoxRuntimeContentScripts(config))
    .catch((error) => {
      logger.error("[Background][FirefoxContentScripts] Failed to sync runtime content scripts", error)
    })
}

function hasAllSitesPermissionDelta(permissions: Browser.permissions.Permissions) {
  return permissions.origins?.includes(ALL_SITES_PERMISSION.origins[0]) ?? false
}

export function setupFirefoxRuntimeContentScriptSync() {
  if (!isFirefoxBuild()) {
    return
  }

  // Firefox already supports runtime content script registration, so keep these
  // scripts out of the manifest and only register the pieces the user is using.
  queueFirefoxRuntimeContentScriptSync()

  browser.runtime.onStartup.addListener(() => {
    queueFirefoxRuntimeContentScriptSync()
  })

  browser.permissions.onAdded.addListener((permissions) => {
    // Sync immediately when Firefox grants the optional all-sites host permission.
    if (hasAllSitesPermissionDelta(permissions)) {
      queueFirefoxRuntimeContentScriptSync()
    }
  })

  browser.permissions.onRemoved.addListener((permissions) => {
    if (hasAllSitesPermissionDelta(permissions)) {
      queueFirefoxRuntimeContentScriptSync()
    }
  })

  storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, (newConfig) => {
    queueFirefoxRuntimeContentScriptSync(newConfig ?? DEFAULT_CONFIG)
  })
}
