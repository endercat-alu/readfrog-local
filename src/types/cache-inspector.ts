export interface TranslationCacheOverview {
  generatedAt: number
  range: {
    key: "1H" | "12H" | "1D" | "7D" | "14D"
    label: string
    startAt: number
    endAt: number
  }
  stats: {
    totalRequests: number
    totalHits: number
    totalMisses: number
    hitRate: number
    exactL1Hits: number
    exactL2Hits: number
    stableL1Hits: number
    stableL2Hits: number
  }
  tables: {
    l1ExactCount: number
    l1StableCount: number
    l2ExactCount: number
    l2StableCount: number
    l2SummaryCount: number
  }
}

export interface TranslationCacheEntryPreview {
  key: string
  value: string
  createdAt?: number
  expiresAt?: number
}

export interface TranslationCacheTablePreview {
  id: string
  title: string
  count: number
  limited: boolean
  entries: TranslationCacheEntryPreview[]
}

export interface TranslationCacheInspection {
  generatedAt: number
  layer: "l1" | "l2"
  limit: number
  tables: TranslationCacheTablePreview[]
}
