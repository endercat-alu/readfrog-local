import type { TestSeriesObject } from "./types"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { testSeries as v062TestSeries } from "./v062"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v062TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        floatingButton: {
          ...seriesData.config.floatingButton,
          appearance: {
            ...DEFAULT_CONFIG.floatingButton.appearance,
            ...seriesData.config.floatingButton?.appearance,
          },
        },
        selectionToolbar: {
          ...seriesData.config.selectionToolbar,
          appearance: {
            ...DEFAULT_CONFIG.selectionToolbar.appearance,
            ...seriesData.config.selectionToolbar?.appearance,
          },
        },
        contextMenu: {
          ...seriesData.config.contextMenu,
          contexts: {
            ...DEFAULT_CONFIG.contextMenu.contexts,
            ...seriesData.config.contextMenu?.contexts,
            selection: {
              ...DEFAULT_CONFIG.contextMenu.contexts.selection,
              ...seriesData.config.contextMenu?.contexts?.selection,
              items: Array.isArray(seriesData.config.contextMenu?.contexts?.selection?.items)
                ? Array.from(new Set([
                    ...seriesData.config.contextMenu.contexts.selection.items,
                    "selectionDictionary",
                  ]))
                : DEFAULT_CONFIG.contextMenu.contexts.selection.items,
            },
          },
        },
      },
    },
  ]),
)
