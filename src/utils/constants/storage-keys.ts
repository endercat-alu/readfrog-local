export const TRANSLATION_STATE_KEY_PREFIX = "session:translationState" as const
export const CACHE_HIGHLIGHT_STATE_KEY_PREFIX = "session:cacheHighlightState" as const

export function getTranslationStateKey(tabId: number): `session:translationState.${number}` {
  return `${TRANSLATION_STATE_KEY_PREFIX}.${tabId}` as const
}

export function getCacheHighlightStateKey(tabId: number): `session:cacheHighlightState.${number}` {
  return `${CACHE_HIGHLIGHT_STATE_KEY_PREFIX}.${tabId}` as const
}
