export type TranslationCacheLayer = "l1" | "l2"

export type TranslationCacheType = "exact" | "stable"

export interface TranslationCacheHit {
  layer: TranslationCacheLayer
  cacheType: TranslationCacheType
}

export interface TranslationResult {
  translation: string
  cacheHit?: TranslationCacheHit
}
