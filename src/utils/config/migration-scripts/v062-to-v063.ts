import { DEFAULT_CONFIG } from "@/utils/constants/config"

/**
 * Migration script from v062 to v063
 * - Adds advanced customization for floating button, selection toolbar, and context menu
 */
export function migrate(oldConfig: any): any {
  const selectionItems = Array.isArray(oldConfig.contextMenu?.contexts?.selection?.items)
    ? Array.from(new Set([
        ...oldConfig.contextMenu.contexts.selection.items,
        "selectionDictionary",
      ]))
    : DEFAULT_CONFIG.contextMenu.contexts.selection.items

  return {
    ...oldConfig,
    floatingButton: {
      ...oldConfig.floatingButton,
      appearance: {
        ...DEFAULT_CONFIG.floatingButton.appearance,
        ...oldConfig.floatingButton?.appearance,
      },
    },
    selectionToolbar: {
      ...oldConfig.selectionToolbar,
      appearance: {
        ...DEFAULT_CONFIG.selectionToolbar.appearance,
        ...oldConfig.selectionToolbar?.appearance,
      },
    },
    contextMenu: {
      ...oldConfig.contextMenu,
      contexts: {
        ...DEFAULT_CONFIG.contextMenu.contexts,
        ...oldConfig.contextMenu?.contexts,
        selection: {
          ...DEFAULT_CONFIG.contextMenu.contexts.selection,
          ...oldConfig.contextMenu?.contexts?.selection,
          items: selectionItems,
        },
      },
    },
  }
}
