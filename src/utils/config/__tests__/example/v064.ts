import type { TestSeriesObject } from "./types"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { testSeries as v063TestSeries } from "./v063"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v063TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        translate: {
          ...seriesData.config.translate,
          page: {
            ...seriesData.config.translate.page,
            nodeIgnoreHeuristics: {
              ...DEFAULT_CONFIG.translate.page.nodeIgnoreHeuristics,
              ...seriesData.config.translate.page?.nodeIgnoreHeuristics,
            },
          },
        },
      },
    },
  ]),
)
