import type { TestSeriesObject } from "./types"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { testSeries as v064TestSeries } from "./v064"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v064TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        translate: {
          ...seriesData.config.translate,
          enableShortTextCache: seriesData.config.translate?.enableShortTextCache ?? DEFAULT_CONFIG.translate.enableShortTextCache,
        },
      },
    },
  ]),
)
