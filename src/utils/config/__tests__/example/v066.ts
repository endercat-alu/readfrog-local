import type { TestSeriesObject } from "./types"
import { testSeries as v065TestSeries } from "./v065"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v065TestSeries).map(([seriesId, seriesData]) => {
    const { betaExperience: _betaExperience, ...config } = seriesData.config
    return [
      seriesId,
      {
        ...seriesData,
        config,
      },
    ]
  }),
)
