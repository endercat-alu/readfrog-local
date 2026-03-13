import type { TestSeriesObject } from "./types"
import { testSeries as v061TestSeries } from "./v061"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v061TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        glossary: {
          entries: [],
        },
      },
    },
  ]),
)
