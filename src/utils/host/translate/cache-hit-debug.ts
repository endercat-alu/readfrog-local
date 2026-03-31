import type { TranslationCacheHit } from "@/types/translation-cache"
import { NOTRANSLATE_CLASS } from "@/utils/constants/dom-labels"

const CACHE_HIT_ATTRIBUTE = "data-read-frog-cache-hit"
const CACHE_HIT_LAYER_ATTRIBUTE = "data-read-frog-cache-layer"
const CACHE_HIT_TYPE_ATTRIBUTE = "data-read-frog-cache-type"
const CACHE_HIT_LABEL_ATTRIBUTE = "data-read-frog-cache-label"
const CACHE_HIT_DEBUG_BADGE_CLASS = "read-frog-cache-hit-badge"
const CACHE_HIT_DEBUG_TARGET_CLASS = "read-frog-cache-hit-target"
const CACHE_HIT_DEBUG_WRAPPER_CLASS = "read-frog-cache-hit-wrapper"
const CACHE_HIT_DEBUG_TEXT_WRAP_ATTRIBUTE = "data-read-frog-cache-debug-wrap"

let isCacheHitDebugEnabled = false

function getCacheHitLabel(cacheHit: TranslationCacheHit): string {
  return `${cacheHit.layer.toUpperCase()} ${cacheHit.cacheType}`
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

  const label = wrapper.getAttribute(CACHE_HIT_LABEL_ATTRIBUTE)
  if (!label) {
    return
  }

  const badge = wrapper.ownerDocument.createElement("span")
  badge.className = `${NOTRANSLATE_CLASS} ${CACHE_HIT_DEBUG_BADGE_CLASS}`
  badge.textContent = label
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

  if (!isCacheHitDebugEnabled || wrapper.getAttribute(CACHE_HIT_ATTRIBUTE) !== "true") {
    return
  }

  ensureBadge(wrapper)
  applyDebugTargets(wrapper)
}

export function setCacheHitDebugEnabled(enabled: boolean) {
  isCacheHitDebugEnabled = enabled

  for (const wrapper of document.querySelectorAll<HTMLElement>(`.read-frog-translated-content-wrapper[${CACHE_HIT_ATTRIBUTE}="true"]`)) {
    syncWrapperDebugState(wrapper)
  }
}

export function applyCacheHitMetadata(wrapper: HTMLElement, cacheHit?: TranslationCacheHit) {
  if (!cacheHit) {
    wrapper.removeAttribute(CACHE_HIT_ATTRIBUTE)
    wrapper.removeAttribute(CACHE_HIT_LAYER_ATTRIBUTE)
    wrapper.removeAttribute(CACHE_HIT_TYPE_ATTRIBUTE)
    wrapper.removeAttribute(CACHE_HIT_LABEL_ATTRIBUTE)
    syncWrapperDebugState(wrapper)
    return
  }

  wrapper.setAttribute(CACHE_HIT_ATTRIBUTE, "true")
  wrapper.setAttribute(CACHE_HIT_LAYER_ATTRIBUTE, cacheHit.layer)
  wrapper.setAttribute(CACHE_HIT_TYPE_ATTRIBUTE, cacheHit.cacheType)
  wrapper.setAttribute(CACHE_HIT_LABEL_ATTRIBUTE, getCacheHitLabel(cacheHit))
  syncWrapperDebugState(wrapper)
}
