import type { TranslationCacheHit } from "@/types/translation-cache"
import {
  CACHE_HIT_DEBUG_BADGE_CLASS,
  CACHE_HIT_DEBUG_TARGET_CLASS,
  CACHE_HIT_DEBUG_TEXT_WRAP_ATTRIBUTE,
  CACHE_HIT_DEBUG_WRAPPER_CLASS,
  CONTENT_WRAPPER_CLASS,
  NOTRANSLATE_CLASS,
  createObfuscatedPropertyKey,
} from "@/utils/constants/dom-labels"

let isCacheHitDebugEnabled = false
const CACHE_HIT_META_PROPERTY = createObfuscatedPropertyKey()

function getCacheHitLabel(cacheHit: TranslationCacheHit): string {
  return `${cacheHit.layer.toUpperCase()} ${cacheHit.cacheType}`
}

function getCacheHitMetadata(wrapper: HTMLElement): TranslationCacheHit | undefined {
  return (wrapper as HTMLElement & Record<string, TranslationCacheHit | undefined>)[CACHE_HIT_META_PROPERTY]
}

function setCacheHitMetadata(wrapper: HTMLElement, cacheHit: TranslationCacheHit): void {
  ;(wrapper as HTMLElement & Record<string, TranslationCacheHit | undefined>)[CACHE_HIT_META_PROPERTY] = cacheHit
}

function clearCacheHitMetadata(wrapper: HTMLElement): void {
  delete (wrapper as HTMLElement & Record<string, TranslationCacheHit | undefined>)[CACHE_HIT_META_PROPERTY]
}

function removeBadge(wrapper: HTMLElement) {
  wrapper.querySelector(`:scope > .${CACHE_HIT_DEBUG_BADGE_CLASS}`)?.remove()
}

function unwrapDebugTextTargets(wrapper: HTMLElement) {
  for (const target of wrapper.querySelectorAll<HTMLElement>(`[${CACHE_HIT_DEBUG_TEXT_WRAP_ATTRIBUTE}="true"]`)) {
    const parent = target.parentNode
    if (!parent) {
      continue
    }

    while (target.firstChild) {
      parent.insertBefore(target.firstChild, target)
    }
    target.remove()
  }
}

function clearDebugTargets(wrapper: HTMLElement) {
  wrapper.classList.remove(CACHE_HIT_DEBUG_WRAPPER_CLASS)
  unwrapDebugTextTargets(wrapper)

  for (const child of wrapper.querySelectorAll<HTMLElement>(`.${CACHE_HIT_DEBUG_TARGET_CLASS}`)) {
    child.classList.remove(CACHE_HIT_DEBUG_TARGET_CLASS)
  }

  removeBadge(wrapper)
}

function ensureTextTargets(wrapper: HTMLElement) {
  const ownerDoc = wrapper.ownerDocument
  const directTextNodes = Array.from(wrapper.childNodes).filter(
    node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
  )

  for (const textNode of directTextNodes) {
    const target = ownerDoc.createElement("span")
    target.className = `${NOTRANSLATE_CLASS} ${CACHE_HIT_DEBUG_TARGET_CLASS}`
    target.setAttribute(CACHE_HIT_DEBUG_TEXT_WRAP_ATTRIBUTE, "true")
    target.textContent = textNode.textContent
    wrapper.replaceChild(target, textNode)
  }
}

function ensureBadge(wrapper: HTMLElement) {
  if (wrapper.querySelector(`:scope > .${CACHE_HIT_DEBUG_BADGE_CLASS}`)) {
    return
  }

  const cacheHit = getCacheHitMetadata(wrapper)
  if (!cacheHit) {
    return
  }

  const badge = wrapper.ownerDocument.createElement("span")
  badge.className = `${NOTRANSLATE_CLASS} ${CACHE_HIT_DEBUG_BADGE_CLASS}`
  badge.textContent = getCacheHitLabel(cacheHit)
  wrapper.insertBefore(badge, wrapper.firstChild)
}

function applyDebugTargets(wrapper: HTMLElement) {
  if (wrapper.style.display === "contents") {
    ensureTextTargets(wrapper)

    for (const child of Array.from(wrapper.children)) {
      if (!(child instanceof HTMLElement) || child.classList.contains(CACHE_HIT_DEBUG_BADGE_CLASS)) {
        continue
      }
      child.classList.add(CACHE_HIT_DEBUG_TARGET_CLASS)
    }
    return
  }

  wrapper.classList.add(CACHE_HIT_DEBUG_WRAPPER_CLASS)
}

function syncWrapperDebugState(wrapper: HTMLElement) {
  clearDebugTargets(wrapper)

  if (!isCacheHitDebugEnabled || !getCacheHitMetadata(wrapper)) {
    return
  }

  ensureBadge(wrapper)
  applyDebugTargets(wrapper)
}

export function setCacheHitDebugEnabled(enabled: boolean) {
  isCacheHitDebugEnabled = enabled

  for (const wrapper of document.querySelectorAll<HTMLElement>(`.${CONTENT_WRAPPER_CLASS}`)) {
    syncWrapperDebugState(wrapper)
  }
}

export function applyCacheHitMetadata(wrapper: HTMLElement, cacheHit?: TranslationCacheHit) {
  if (!cacheHit) {
    clearCacheHitMetadata(wrapper)
    syncWrapperDebugState(wrapper)
    return
  }

  setCacheHitMetadata(wrapper, cacheHit)
  syncWrapperDebugState(wrapper)
}
