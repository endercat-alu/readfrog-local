import type { TestSeriesObject } from "./types"
import { testSeries as v059TestSeries } from "./v059"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v059TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        translate: {
          ...seriesData.config.translate,
          page: {
            ...seriesData.config.translate.page,
            paragraphSegmentation: {
              enabledRules: ["blankLine"],
              maxLinesPerParagraph: 2,
            },
          },
        },
      },
    },
  ]),
)
