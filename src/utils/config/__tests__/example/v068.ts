import type { TestSeriesObject } from "./types"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { testSeries as v067TestSeries } from "./v067"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v067TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        translate: {
          ...seriesData.config.translate,
          page: {
            ...seriesData.config.translate.page,
            fastTranslation: {
              ...DEFAULT_CONFIG.translate.page.fastTranslation,
              ...seriesData.config.translate.page?.fastTranslation,
            },
          },
        },
      },
    },
  ]),
)
