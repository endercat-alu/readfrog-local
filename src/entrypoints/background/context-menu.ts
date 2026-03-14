import type { Browser } from "#imports"
import type { Config } from "@/types/config/config"
import type { ContextMenuItem, ContextMenuTarget } from "@/types/config/overlay-tools"
import { browser, i18n, storage } from "#imports"
import { APP_NAME } from "@/utils/constants/app"
import { CONFIG_STORAGE_KEY } from "@/utils/constants/config"
import { getTranslationStateKey, TRANSLATION_STATE_KEY_PREFIX } from "@/utils/constants/storage-keys"
import { sendMessage } from "@/utils/message"
import { ensureInitializedConfig } from "./config"

const MENU_PARENT_PREFIX = "read-frog-parent"
const MENU_ACTION_PREFIX = "read-frog-action"
type MenuContexts = Browser.contextMenus.CreateProperties["contexts"]
type DynamicContextMenuAPI = typeof browser.contextMenus & {
  onShown?: {
    addListener: (callback: (info: { contexts?: string[] }) => void | Promise<void>) => void
  }
  refresh?: () => void
}

const CONTEXT_MENU_PRIORITY: ContextMenuTarget[] = [
  "selection",
  "editable",
  "link",
  "image",
  "page",
]
const dynamicContextMenus = browser.contextMenus as DynamicContextMenuAPI
const SUPPORTS_DYNAMIC_VISIBILITY = typeof dynamicContextMenus.onShown?.addListener === "function"

const CONTEXT_MENU_CONTEXTS: Record<ContextMenuTarget, MenuContexts> = {
  page: ["page"] as MenuContexts,
  selection: ["selection"] as MenuContexts,
  link: ["link"] as MenuContexts,
  image: ["image"] as MenuContexts,
  editable: ["editable"] as MenuContexts,
}

const DEFAULT_ACTION_IDS: Record<ContextMenuItem, string[]> = {
  selectionTranslate: [],
  selectionVocabularyInsight: [],
  togglePageTranslation: [],
  translateSelectionInHub: [],
  openOptions: [],
}

let currentConfig: Config | null = null
let actionMenuIds: Record<ContextMenuItem, string[]> = { ...DEFAULT_ACTION_IDS }
let targetMenuIds: Record<ContextMenuTarget, string[]> = {
  page: [],
  selection: [],
  link: [],
  image: [],
  editable: [],
}

function getParentMenuId(target: ContextMenuTarget) {
  return `${MENU_PARENT_PREFIX}:${target}`
}

function getActionMenuId(target: ContextMenuTarget, action: ContextMenuItem) {
  return `${MENU_ACTION_PREFIX}:${target}:${action}`
}

function parseActionMenuId(menuItemId: string): { target: ContextMenuTarget, action: ContextMenuItem } | null {
  if (!menuItemId.includes(MENU_ACTION_PREFIX)) {
    return null
  }

  const parts = menuItemId.split(":")
  const target = parts.find((part): part is ContextMenuTarget => part in CONTEXT_MENU_CONTEXTS)
  const action = parts.find((part): part is ContextMenuItem => part in DEFAULT_ACTION_IDS)

  if (!target || !action) {
    return null
  }

  return { target, action }
}

function getActionTitle(action: ContextMenuItem, isTranslated: boolean) {
  switch (action) {
    case "togglePageTranslation":
      return isTranslated
        ? i18n.t("contextMenu.showOriginal")
        : i18n.t("contextMenu.translate")
    case "selectionTranslate":
      return i18n.t("contextMenu.selectionTranslate")
    case "selectionVocabularyInsight":
      return i18n.t("contextMenu.selectionVocabularyInsight")
    case "translateSelectionInHub":
      return i18n.t("contextMenu.translateSelectionInHub")
    case "openOptions":
      return i18n.t("contextMenu.openOptions")
  }
}

function resetMenuRegistry() {
  actionMenuIds = {
    selectionTranslate: [],
    selectionVocabularyInsight: [],
    togglePageTranslation: [],
    translateSelectionInHub: [],
    openOptions: [],
  }
  targetMenuIds = {
    page: [],
    selection: [],
    link: [],
    image: [],
    editable: [],
  }
}

function resolveActiveTarget(info: { contexts?: string[] | undefined }): ContextMenuTarget | null {
  const activeContexts = new Set(info.contexts ?? [])

  for (const target of CONTEXT_MENU_PRIORITY) {
    if (activeContexts.has(target)) {
      return target
    }
  }

  return activeContexts.has("page") ? "page" : null
}

async function getIsTranslated(tabId: number, enabled?: boolean) {
  if (enabled !== undefined) {
    return enabled
  }

  const state = await storage.getItem<{ enabled: boolean }>(
    getTranslationStateKey(tabId),
  )
  return state?.enabled ?? false
}

async function updateMenuVisibility(activeTarget: ContextMenuTarget | null) {
  const updates: Promise<unknown>[] = []

  for (const target of Object.keys(targetMenuIds) as ContextMenuTarget[]) {
    const visible = activeTarget === target

    for (const id of targetMenuIds[target]) {
      updates.push(
        browser.contextMenus.update(id, { visible }).catch(() => {}),
      )
    }
  }

  await Promise.all(updates)

  if (typeof dynamicContextMenus.refresh === "function") {
    try {
      dynamicContextMenus.refresh()
    }
    catch {
    }
  }
}

/**
 * Register all context menu event listeners synchronously
 * This must be called during main() execution to ensure listeners are registered
 * before Chrome completes initialization
 */
export function registerContextMenuListeners() {
  storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, async (newConfig) => {
    if (newConfig) {
      currentConfig = newConfig
      await updateContextMenuItems(newConfig)
    }
  })

  browser.tabs.onActivated.addListener(async (activeInfo) => {
    await updateTranslateMenuTitle(activeInfo.tabId)
  })

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === "complete") {
      await updateTranslateMenuTitle(tabId)
    }
  })

  browser.storage.session.onChanged.addListener(async (changes) => {
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(TRANSLATION_STATE_KEY_PREFIX.replace("session:", ""))) {
        continue
      }

      const parts = key.split(".")
      const tabId = Number.parseInt(parts[1])

      if (Number.isNaN(tabId)) {
        continue
      }

      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (activeTab?.id !== tabId) {
        continue
      }

      const newValue = change.newValue as { enabled: boolean } | undefined
      await updateTranslateMenuTitle(tabId, newValue?.enabled)
    }
  })

  browser.contextMenus.onClicked.addListener(handleContextMenuClick)

  if (SUPPORTS_DYNAMIC_VISIBILITY) {
    dynamicContextMenus.onShown?.addListener(async (info) => {
      await updateMenuVisibility(resolveActiveTarget(info))
    })
  }
}

/**
 * Initialize context menu items based on config
 * This can be called asynchronously after listeners are registered
 */
export async function initializeContextMenu() {
  const config = await ensureInitializedConfig()
  if (!config) {
    return
  }

  currentConfig = config
  await updateContextMenuItems(config)
}

async function createActionMenuItem(
  target: ContextMenuTarget,
  action: ContextMenuItem,
  parentId: string | undefined,
  isTranslated: boolean,
) {
  const id = getActionMenuId(target, action)
  browser.contextMenus.create({
    id,
    parentId,
    title: getActionTitle(action, isTranslated),
    contexts: CONTEXT_MENU_CONTEXTS[target],
    visible: !SUPPORTS_DYNAMIC_VISIBILITY,
  })
  actionMenuIds[action].push(id)
  targetMenuIds[target].push(id)
}

/**
 * Update context menu items based on config
 */
async function updateContextMenuItems(config: Config) {
  await browser.contextMenus.removeAll()
  resetMenuRegistry()

  if (!config.contextMenu.enabled) {
    return
  }

  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
  const isTranslated = activeTab?.id
    ? await getIsTranslated(activeTab.id)
    : false

  for (const target of Object.keys(config.contextMenu.contexts) as ContextMenuTarget[]) {
    const contextConfig = config.contextMenu.contexts[target]
    const items = Array.from(new Set(contextConfig.items))

    if (!contextConfig.enabled || items.length === 0) {
      continue
    }

    let parentId: string | undefined

    if (contextConfig.collapsed) {
      parentId = getParentMenuId(target)
      browser.contextMenus.create({
        id: parentId,
        title: APP_NAME,
        contexts: CONTEXT_MENU_CONTEXTS[target],
        visible: !SUPPORTS_DYNAMIC_VISIBILITY,
      })
      targetMenuIds[target].push(parentId)
    }

    for (const action of items) {
      await createActionMenuItem(target, action, parentId, isTranslated)
    }
  }
}

/**
 * Update translate menu title based on current translation state
 */
async function updateTranslateMenuTitle(tabId: number, enabled?: boolean) {
  const config = currentConfig ?? await ensureInitializedConfig()
  if (!config?.contextMenu.enabled) {
    return
  }

  const title = getActionTitle(
    "togglePageTranslation",
    await getIsTranslated(tabId, enabled),
  )

  await Promise.all(
    actionMenuIds.togglePageTranslation.map(id =>
      browser.contextMenus.update(id, { title }).catch(() => {}),
    ),
  )
}

/**
 * Handle context menu item click
 */
async function handleContextMenuClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
) {
  const parsed = parseActionMenuId(String(info.menuItemId))
  if (!parsed) {
    return
  }

  switch (parsed.action) {
    case "selectionTranslate":
      if (tab?.id) {
        await sendMessage("openSelectionToolbarFeatureFromContextMenu", { feature: "translate" }, tab.id)
      }
      break
    case "selectionVocabularyInsight":
      if (tab?.id) {
        await sendMessage("openSelectionToolbarFeatureFromContextMenu", { feature: "vocabularyInsight" }, tab.id)
      }
      break
    case "togglePageTranslation":
      if (tab?.id) {
        await handleTranslateClick(tab.id)
      }
      break
    case "translateSelectionInHub":
      await handleTranslateSelectionInHub(info.selectionText)
      break
    case "openOptions":
      await browser.runtime.openOptionsPage()
      break
  }
}

/**
 * Handle translate menu click - toggle page translation
 */
async function handleTranslateClick(tabId: number) {
  const state = await storage.getItem<{ enabled: boolean }>(
    getTranslationStateKey(tabId),
  )
  const isCurrentlyTranslated = state?.enabled ?? false
  const newState = !isCurrentlyTranslated

  await storage.setItem(getTranslationStateKey(tabId), { enabled: newState })
  void sendMessage("askManagerToTogglePageTranslation", { enabled: newState }, tabId)
  await updateTranslateMenuTitle(tabId, newState)
}

async function handleTranslateSelectionInHub(selectionText?: string) {
  const text = selectionText?.trim()
  if (!text) {
    return
  }

  await browser.tabs.create({
    url: `${browser.runtime.getURL("/translation-hub.html")}?text=${encodeURIComponent(text)}`,
  })
}
