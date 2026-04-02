function createRandomToken(): string {
  const bytes = new Uint32Array(2)
  crypto.getRandomValues(bytes)
  return `${bytes[0].toString(36)}${bytes[1].toString(36)}`
}

export function createObfuscatedClassName(): string {
  return `x${createRandomToken()}`
}

export function createObfuscatedAttributeName(): string {
  return `data-x${createRandomToken()}`
}

export function createObfuscatedPropertyKey(): string {
  return `__x${createRandomToken()}`
}

export const CONTENT_WRAPPER_CLASS = createObfuscatedClassName()
export const INLINE_CONTENT_CLASS = createObfuscatedClassName()
export const BLOCK_CONTENT_CLASS = createObfuscatedClassName()
export const FAST_TRANSLATION_INDICATOR_CLASS = createObfuscatedClassName()
export const FAST_TRANSLATION_INDICATOR_STATE_ATTRIBUTE = createObfuscatedAttributeName()

export const WALKED_ATTRIBUTE = createObfuscatedAttributeName()
// paragraph means you need to trigger translation on this element (i.e. we have inline children in it)
export const PARAGRAPH_ATTRIBUTE = createObfuscatedAttributeName()
export const BLOCK_ATTRIBUTE = createObfuscatedAttributeName()
export const INLINE_ATTRIBUTE = createObfuscatedAttributeName()

export const TRANSLATION_MODE_ATTRIBUTE = createObfuscatedAttributeName()
export const TRANSLATION_MODE_VALUE = {
  bilingual: createRandomToken(),
  translationOnly: createRandomToken(),
} as const

export const MARK_ATTRIBUTES = new Set([WALKED_ATTRIBUTE, PARAGRAPH_ATTRIBUTE, BLOCK_ATTRIBUTE, INLINE_ATTRIBUTE])

export const NOTRANSLATE_CLASS = "notranslate"

export const REACT_SHADOW_HOST_CLASS = createObfuscatedClassName()

export const TRANSLATION_ERROR_CONTAINER_CLASS = createObfuscatedClassName()
export const SPINNER_CLASS = createObfuscatedClassName()
export const CACHE_HIT_DEBUG_BADGE_CLASS = createObfuscatedClassName()
export const CACHE_HIT_DEBUG_TARGET_CLASS = createObfuscatedClassName()
export const CACHE_HIT_DEBUG_WRAPPER_CLASS = createObfuscatedClassName()
export const CACHE_HIT_DEBUG_TEXT_WRAP_ATTRIBUTE = createObfuscatedAttributeName()
