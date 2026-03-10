import type { TestSeriesObject } from "./types"
import { testSeries as v060TestSeries } from "./v060"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v060TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        translate: {
          ...seriesData.config.translate,
          aiContentAwareMode: "viewport",
        },
      },
    },
  ]),
)
