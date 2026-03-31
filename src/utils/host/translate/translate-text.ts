import type { LangCodeISO6393, LangLevel } from "@read-frog/definitions"
import type { Config } from "@/types/config/config"
import type { GlossaryEntry } from "@/types/config/glossary"
import type { ProviderConfig } from "@/types/config/provider"
import type { TranslationResult } from "@/types/translation-cache"
import type { AIContentAwareMode } from "@/types/config/translate"
import type { DetectLanguageOptions } from "@/utils/content/language"
import { i18n } from "#imports"
import { Readability } from "@mozilla/readability"
import { LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME } from "@read-frog/definitions"
import { toast } from "sonner"
import { isAPIProviderConfig, isLLMProviderConfig } from "@/types/config/provider"
import { getDetectedCodeFromStorage } from "@/utils/config/languages"
import { getProviderConfigById } from "@/utils/config/helpers"
import { BLOCK_ATTRIBUTE, PARAGRAPH_ATTRIBUTE } from "@/utils/constants/dom-labels"
import { detectLanguage } from "@/utils/content/language"
import { cleanText, removeDummyNodes } from "@/utils/content/utils"
import { prepareGlossaryTranslation } from "@/utils/glossary/translation"
import { isHTMLElement, isTextNode } from "@/utils/host/dom/filter"
import { findNearestAncestorBlockNodeFor } from "@/utils/host/dom/find"
import { extractTextContent } from "@/utils/host/dom/traversal"
import { logger } from "@/utils/logger"
import { getTranslatePrompt } from "@/utils/prompts/translate"
import { Sha256Hex } from "../../hash"
import { sendMessage } from "../../message"

const MIN_LENGTH_FOR_LANG_DETECTION = 50
const VIEWPORT_SAMPLE_COLUMNS = 4
const VIEWPORT_SAMPLE_ROWS = 6
const MAX_VIEWPORT_CONTEXT_NODES = 16
const MAX_VIEWPORT_CONTEXT_LENGTH = 6000
const MAX_VIEWPORT_NODE_TEXT_LENGTH = 600
const MIN_VIEWPORT_NODE_TEXT_LENGTH = 40
const VIEWPORT_CACHE_SCROLL_GRANULARITY = 240
const SHORT_TEXT_CACHE_MAX_LENGTH = 32
const SHORT_TEXT_CACHE_MAX_WORDS = 4
const SHORT_TEXT_CACHE_MAX_SYMBOLS = 2
const SHARED_TEXT_CACHE_VERSION_TAG = "sharedTextCache:v2"
const LOCAL_CONTEXT_FINGERPRINT_VERSION_TAG = "localContext:v1"
const ARTICLE_CONTEXT_FINGERPRINT_VERSION_TAG = "articleContext:v1"
const SHARED_TEXT_CACHE_MAX_LENGTH = 280
const SHARED_TEXT_CACHE_MAX_LINES = 4
const SHARED_TEXT_CACHE_REPETITION_THRESHOLD = 2
const LOCAL_CONTEXT_MAX_LENGTH = 1200
const REPEATED_PAGE_TEXT_STATE_MAX_ENTRIES = 2000
const LANGUAGE_DETECTION_CACHE_MAX_ENTRIES = 500
const META_CONTENT_SELECTORS = [
  "meta[property='og:title']",
  "meta[name='twitter:title']",
  "meta[name='description']",
  "meta[property='og:description']",
  "meta[name='twitter:description']",
  "meta[name='author']",
] as const
const LOCAL_CONTEXT_TAGS = new Set([
  "P",
  "LI",
  "TD",
  "TH",
  "DD",
  "DT",
  "BLOCKQUOTE",
  "PRE",
  "CODE",
  "ARTICLE",
  "SECTION",
  "MAIN",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "NAV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
])
const BOILERPLATE_CONTEXT_SELECTOR = [
  "footer",
  "nav",
  "header",
  "aside",
  "[role='contentinfo']",
  "[role='navigation']",
  ".footer",
  ".Footer",
  ".pager",
  ".Pager",
  ".breadcrumb",
  ".Breadcrumb",
  ".copyright",
  ".Copyright",
  ".powered",
  ".PoweredBy",
  ".policy",
  ".Policy",
  ".terms",
  ".Terms",
].join(", ")
// Minimum text length for skip language detection (shorter than general detection
// to catch short phrases like "Bonjour!" or "こんにちは")
export const MIN_LENGTH_FOR_SKIP_LLM_DETECTION = 10

let repeatedPageTextState: {
  url: string
  counts: Map<string, number>
} | null = null

let localContextCacheState: {
  url: string
  textByElement: WeakMap<HTMLElement, string | null>
  fingerprintByElement: WeakMap<HTMLElement, string | null>
} | null = null

let languageDetectionCacheState: {
  url: string
  results: Map<string, LangCodeISO6393 | null>
  pending: Map<string, Promise<LangCodeISO6393 | null>>
} | null = null

function getLanguageDetectionCacheState() {
  if (typeof window === "undefined") {
    return null
  }

  if (!languageDetectionCacheState || languageDetectionCacheState.url !== window.location.href) {
    languageDetectionCacheState = {
      url: window.location.href,
      results: new Map(),
      pending: new Map(),
    }
  }

  return languageDetectionCacheState
}

function buildLanguageDetectionCacheKey(
  text: string,
  options?: Pick<DetectLanguageOptions, "enableLLM" | "providerConfig">,
): string {
  const normalizedText = cleanText(text, 2048)
  const detectionMode = options?.enableLLM && options.providerConfig
    ? `llm:${options.providerConfig.id}`
    : "franc"

  return `${detectionMode}:${normalizedText}`
}

export async function detectLanguageCached(
  text: string,
  options?: DetectLanguageOptions,
): Promise<LangCodeISO6393 | null> {
  const trimmedText = text.trim()
  const minLength = options?.minLength ?? MIN_LENGTH_FOR_SKIP_LLM_DETECTION
  if (trimmedText.length < minLength) {
    return null
  }

  const cacheState = getLanguageDetectionCacheState()
  if (!cacheState) {
    return detectLanguage(text, options)
  }

  const cacheKey = buildLanguageDetectionCacheKey(trimmedText, options)
  const cachedResult = cacheState.results.get(cacheKey)
  if (cachedResult !== undefined) {
    return cachedResult
  }

  const pendingResult = cacheState.pending.get(cacheKey)
  if (pendingResult) {
    return pendingResult
  }

  const nextResultPromise = detectLanguage(text, options).then((result) => {
    cacheState.pending.delete(cacheKey)

    if (!cacheState.results.has(cacheKey) && cacheState.results.size >= LANGUAGE_DETECTION_CACHE_MAX_ENTRIES) {
      const oldestKey = cacheState.results.keys().next().value
      if (oldestKey) {
        cacheState.results.delete(oldestKey)
      }
    }

    cacheState.results.set(cacheKey, result)
    return result
  })

  cacheState.pending.set(cacheKey, nextResultPromise)
  return nextResultPromise
}

/**
 * Check if text should be skipped based on language detection.
 * Uses LLM detection if enabled, falls back to franc library.
 * @param text - Text to detect language for
 * @param skipLanguages - List of languages to skip translation for
 * @param enableLLMDetection - Whether to use LLM for language detection
 * @param providerConfig - Provider configuration for LLM detection
 * @returns true if text language is in skipLanguages list (should skip translation)
 */
export async function shouldSkipByLanguage(
  text: string,
  skipLanguages: LangCodeISO6393[],
  enableLLMDetection: boolean,
  providerConfig: ProviderConfig,
  pageDetectedCode?: LangCodeISO6393,
): Promise<boolean> {
  if (skipLanguages.length === 0) {
    return false
  }

  const resolvedPageDetectedCode = pageDetectedCode ?? await getDetectedCodeFromStorage()
  if (skipLanguages.includes(resolvedPageDetectedCode)) {
    return true
  }

  const isLLMProvider = isLLMProviderConfig(providerConfig)
  const detectedLang = await detectLanguageCached(text, {
    minLength: MIN_LENGTH_FOR_SKIP_LLM_DETECTION,
    enableLLM: enableLLMDetection && isLLMProvider,
    providerConfig: isLLMProvider ? providerConfig : undefined,
  })

  if (!detectedLang) {
    return false
  }

  return skipLanguages.includes(detectedLang)
}

// Module-level cache for article data (only meaningful in content script context)
let cachedArticleData: {
  url: string
  mode: AIContentAwareMode
  viewportKey: string
  title: string
  textContent: string
} | null = null

function getViewportCacheKey(mode: AIContentAwareMode): string {
  if (mode === "document") {
    return "document"
  }

  const x = Math.round(window.scrollX / VIEWPORT_CACHE_SCROLL_GRANULARITY)
  const y = Math.round(window.scrollY / VIEWPORT_CACHE_SCROLL_GRANULARITY)
  return `${x}:${y}:${window.innerWidth}x${window.innerHeight}`
}

function getCachedArticleData(mode: AIContentAwareMode): typeof cachedArticleData {
  if (
    typeof window !== "undefined"
    && cachedArticleData
    && (
      cachedArticleData.url !== window.location.href
      || cachedArticleData.mode !== mode
      || cachedArticleData.viewportKey !== getViewportCacheKey(mode)
    )
  ) {
    cachedArticleData = null
  }
  return cachedArticleData
}

function normalizeContextText(text: string, maxLength: number): string {
  return cleanText(text, maxLength)
}

function getLocalContextCacheState() {
  if (typeof window === "undefined") {
    return null
  }

  if (!localContextCacheState || localContextCacheState.url !== window.location.href) {
    localContextCacheState = {
      url: window.location.href,
      textByElement: new WeakMap(),
      fingerprintByElement: new WeakMap(),
    }
  }

  return localContextCacheState
}

function getCachedLocalContextText(container: HTMLElement, config: Config): string | undefined {
  const cacheState = getLocalContextCacheState()
  const cachedText = cacheState?.textByElement.get(container)
  if (cachedText !== undefined) {
    return cachedText ?? undefined
  }

  const nextText = normalizeContextText(extractTextContent(container, config), LOCAL_CONTEXT_MAX_LENGTH)
  cacheState?.textByElement.set(container, nextText || null)
  return nextText || undefined
}

function getCachedLocalContextFingerprint(container: HTMLElement, config: Config): string | undefined {
  const cacheState = getLocalContextCacheState()
  const cachedFingerprint = cacheState?.fingerprintByElement.get(container)
  if (cachedFingerprint !== undefined) {
    return cachedFingerprint ?? undefined
  }

  const contextText = getCachedLocalContextText(container, config)
  const nextFingerprint = contextText
    ? Sha256Hex(
        LOCAL_CONTEXT_FINGERPRINT_VERSION_TAG,
        container.tagName,
        contextText,
      )
    : undefined

  cacheState?.fingerprintByElement.set(container, nextFingerprint ?? null)
  return nextFingerprint
}

function countShortTextCacheWords(text: string): number {
  const words = text.split(/\s+/u).filter(Boolean)
  if (words.length > 0) {
    return words.length
  }

  return Array.from(text).length
}

export function isShortTextCacheCandidate(text: string): boolean {
  const normalizedText = cleanText(text, SHORT_TEXT_CACHE_MAX_LENGTH + 1)
  if (!normalizedText || normalizedText.length > SHORT_TEXT_CACHE_MAX_LENGTH) {
    return false
  }

  if (/[\r\n\t]/u.test(text)) {
    return false
  }

  if (/[<>{}[\]\\/@#%^*_+=|]/u.test(normalizedText)) {
    return false
  }

  if (/%\w|%\d|\$\{|\{\{|\}\}|<[^>]+>/u.test(normalizedText)) {
    return false
  }

  const words = countShortTextCacheWords(normalizedText)
  if (words > SHORT_TEXT_CACHE_MAX_WORDS) {
    return false
  }

  const symbolCount = (normalizedText.match(/[!?,.;:()[\]"'`~-]/gu) ?? []).length
  if (symbolCount > SHORT_TEXT_CACHE_MAX_SYMBOLS) {
    return false
  }

  return /[\p{L}\p{N}]/u.test(normalizedText)
}

function isSharedTextCacheCandidate(text: string): boolean {
  const normalizedText = cleanText(text, SHARED_TEXT_CACHE_MAX_LENGTH + 1)
  if (!normalizedText || normalizedText.length > SHARED_TEXT_CACHE_MAX_LENGTH) {
    return false
  }

  const lines = normalizedText.split(/\n+/u).filter(Boolean)
  if (lines.length > SHARED_TEXT_CACHE_MAX_LINES) {
    return false
  }

  if (/%\w|%\d|\$\{|\{\{|\}\}|<[^>]+>/u.test(normalizedText)) {
    return false
  }

  if (/^[\d\W_]+$/u.test(normalizedText)) {
    return false
  }

  return /[\p{L}\p{N}]/u.test(normalizedText)
}

function getRepeatedPageTextCount(text: string): number {
  if (typeof window === "undefined") {
    return 0
  }

  const normalizedText = cleanText(text, SHARED_TEXT_CACHE_MAX_LENGTH)
  if (!normalizedText) {
    return 0
  }

  if (!repeatedPageTextState || repeatedPageTextState.url !== window.location.href) {
    repeatedPageTextState = {
      url: window.location.href,
      counts: new Map(),
    }
  }

  if (
    !repeatedPageTextState.counts.has(normalizedText)
    && repeatedPageTextState.counts.size >= REPEATED_PAGE_TEXT_STATE_MAX_ENTRIES
  ) {
    const oldestKey = repeatedPageTextState.counts.keys().next().value
    if (oldestKey) {
      repeatedPageTextState.counts.delete(oldestKey)
    }
  }

  const nextCount = (repeatedPageTextState.counts.get(normalizedText) ?? 0) + 1
  repeatedPageTextState.counts.set(normalizedText, nextCount)
  return nextCount
}

function getElementFromNode(node: ChildNode): HTMLElement | null {
  if (isHTMLElement(node)) {
    return node
  }

  if (isTextNode(node)) {
    return node.parentElement
  }

  return null
}

function findCommonAncestorElement(elements: HTMLElement[]): HTMLElement | null {
  const [first, ...rest] = elements
  if (!first) {
    return null
  }

  let candidate: HTMLElement | null = first
  while (candidate) {
    const currentCandidate = candidate
    if (rest.every(element => currentCandidate === element || currentCandidate.contains(element))) {
      return candidate
    }
    candidate = candidate.parentElement
  }

  return null
}

function resolveLocalContextElement(nodes: ChildNode[], config: Config): HTMLElement | null {
  if (typeof document === "undefined") {
    return null
  }

  const elements = nodes
    .map(getElementFromNode)
    .filter((element): element is HTMLElement => !!element)

  const commonAncestor = findCommonAncestorElement(elements)
  if (!commonAncestor) {
    return null
  }

  let fallback: HTMLElement | null = null
  let current: HTMLElement | null = commonAncestor

  while (current && current !== document.body && current !== document.documentElement) {
    const normalizedText = getCachedLocalContextText(current, config)
    if (normalizedText) {
      fallback ??= current
    }

    if (current.hasAttribute(PARAGRAPH_ATTRIBUTE)) {
      return current
    }

    if (current.hasAttribute(BLOCK_ATTRIBUTE) || LOCAL_CONTEXT_TAGS.has(current.tagName)) {
      return current
    }

    current = current.parentElement
  }

  return fallback
}

function isBoilerplateContextElement(element?: HTMLElement): boolean {
  if (!element) {
    return false
  }

  return element.matches(BOILERPLATE_CONTEXT_SELECTOR) || !!element.closest(BOILERPLATE_CONTEXT_SELECTOR)
}

export function buildArticleContextFingerprint(articleContext?: { title?: string, textContent?: string }): string | undefined {
  if (!articleContext?.title && !articleContext?.textContent) {
    return undefined
  }

  return Sha256Hex(
    ARTICLE_CONTEXT_FINGERPRINT_VERSION_TAG,
    articleContext?.title ?? "",
    articleContext?.textContent?.slice(0, 1000) ?? "",
  )
}

export function buildLocalContextFingerprint(
  nodes: ChildNode[],
  config: Config,
): { fingerprint?: string, container?: HTMLElement } {
  const container = resolveLocalContextContainer(nodes, config)
  if (!container) {
    return {}
  }

  const fingerprint = getCachedLocalContextFingerprint(container, config)
  if (!fingerprint) {
    return { container }
  }

  return {
    container,
    fingerprint,
  }
}

export function resolveLocalContextContainer(
  nodes: ChildNode[],
  config: Config,
): HTMLElement | undefined {
  return resolveLocalContextElement(nodes, config) ?? undefined
}

function collectMetaContextParts(title: string): string[] {
  const parts = new Set<string>()

  if (title.trim()) {
    parts.add(title.trim())
  }

  for (const selector of META_CONTENT_SELECTORS) {
    const content = document.querySelector(selector)?.getAttribute("content")
    if (!content) {
      continue
    }

    const normalized = normalizeContextText(content, 300)
    if (normalized) {
      parts.add(normalized)
    }
  }

  return Array.from(parts)
}

function resolveViewportContextElement(element: HTMLElement): HTMLElement | null {
  const nearestBlockNode = findNearestAncestorBlockNodeFor(element)
  let current = nearestBlockNode instanceof HTMLElement ? nearestBlockNode : nearestBlockNode?.parentElement ?? null
  let fallback: HTMLElement | null = null

  for (let depth = 0; current && depth < 5; depth++) {
    if (current === document.body || current === document.documentElement) {
      break
    }

    const text = normalizeContextText(current.textContent || "", MAX_VIEWPORT_NODE_TEXT_LENGTH)
    if (text) {
      fallback ??= current
      if (text.length >= MIN_VIEWPORT_NODE_TEXT_LENGTH) {
        return current
      }
    }

    current = current.parentElement
  }

  return fallback
}

function extractViewportArticleText(title: string): string {
  const fragments: string[] = []
  const seenElements = new Set<HTMLElement>()
  const seenTexts = new Set<string>()
  const width = Math.max(window.innerWidth, document.documentElement.clientWidth || 0)
  const height = Math.max(window.innerHeight, document.documentElement.clientHeight || 0)

  for (const metaPart of collectMetaContextParts(title)) {
    if (!seenTexts.has(metaPart)) {
      fragments.push(metaPart)
      seenTexts.add(metaPart)
    }
  }

  if (width <= 0 || height <= 0) {
    return fragments.join("\n\n")
  }

  for (let row = 0; row < VIEWPORT_SAMPLE_ROWS; row++) {
    const y = Math.min(height - 1, Math.round((row + 0.5) * height / VIEWPORT_SAMPLE_ROWS))

    for (let column = 0; column < VIEWPORT_SAMPLE_COLUMNS; column++) {
      const x = Math.min(width - 1, Math.round((column + 0.5) * width / VIEWPORT_SAMPLE_COLUMNS))
      const elements = document.elementsFromPoint(x, y)

      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
          continue
        }

        const candidate = resolveViewportContextElement(element)
        if (!candidate || seenElements.has(candidate)) {
          continue
        }

        seenElements.add(candidate)
        const text = normalizeContextText(candidate.textContent || "", MAX_VIEWPORT_NODE_TEXT_LENGTH)
        if (!text || seenTexts.has(text)) {
          continue
        }

        fragments.push(text)
        seenTexts.add(text)

        if (fragments.length >= MAX_VIEWPORT_CONTEXT_NODES) {
          return normalizeContextText(fragments.join("\n\n"), MAX_VIEWPORT_CONTEXT_LENGTH)
        }

        break
      }
    }
  }

  return normalizeContextText(fragments.join("\n\n"), MAX_VIEWPORT_CONTEXT_LENGTH)
}

export async function getOrFetchArticleData(
  enableAIContentAware: boolean,
  mode: AIContentAwareMode = "viewport",
): Promise<{ title: string, textContent?: string } | null> {
  // Only works in browser context
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null
  }

  // When our extension add content to the page, we don't want the cache to be invalidated
  // so our cache here will always live unless the page is refreshed
  const cached = getCachedArticleData(mode)

  // Cache should only be reused when the stored entry already includes text content
  // otherwise the feature never obtains article text after being enabled mid-session.
  if (cached && (!enableAIContentAware || cached.textContent)) {
    return {
      title: cached.title,
      textContent: enableAIContentAware ? cached.textContent : undefined,
    }
  }

  // Always get title
  const title = document.title || ""

  // Only extract textContent if needed
  let textContent = ""
  if (enableAIContentAware) {
    if (mode === "document") {
      try {
        const documentClone = document.cloneNode(true) as Document
        await removeDummyNodes(documentClone)
        const article = new Readability(documentClone, { serializer: el => el }).parse()

        if (article?.textContent) {
          textContent = article.textContent
        }
      }
      catch (error) {
        logger.warn("Readability parsing failed, falling back to body textContent:", error)
      }

      if (!textContent) {
        textContent = document.body?.textContent || ""
      }
    }
    else {
      textContent = extractViewportArticleText(title)
    }
  }

  cachedArticleData = {
    url: window.location.href,
    mode,
    viewportKey: getViewportCacheKey(mode),
    title,
    textContent,
  }

  return {
    title,
    textContent: enableAIContentAware ? textContent : undefined,
  }
}

export async function buildHashComponents(
  text: string,
  providerConfig: ProviderConfig,
  partialLangConfig: { sourceCode: LangCodeISO6393 | "auto", targetCode: LangCodeISO6393 },
  enableAIContentAware: boolean,
  aiContentAwareMode: AIContentAwareMode = "document",
  exactCacheContextFingerprint?: string,
  glossaryPrompt?: string,
): Promise<string[]> {
  const hashComponents = [
    text,
    JSON.stringify(providerConfig),
    // don't include detectedCode because it may change after the page is translated, i.e. it's not accurate
    partialLangConfig.sourceCode,
    partialLangConfig.targetCode,
  ]

  if (isLLMProviderConfig(providerConfig)) {
    const targetLangName = LANG_CODE_TO_EN_NAME[partialLangConfig.targetCode]
    const { systemPrompt, prompt } = await getTranslatePrompt(targetLangName, text, { isBatch: true, glossaryPrompt })
    hashComponents.push(systemPrompt, prompt)
    hashComponents.push(enableAIContentAware ? "enableAIContentAware=true" : "enableAIContentAware=false")
    hashComponents.push(`aiContentAwareMode:${aiContentAwareMode}`)

    if (exactCacheContextFingerprint) {
      hashComponents.push(`context:${exactCacheContextFingerprint}`)
    }
  }

  return hashComponents
}

export async function buildSharedTextCacheKey(
  text: string,
  providerConfig: ProviderConfig,
  partialLangConfig: { sourceCode: LangCodeISO6393 | "auto", targetCode: LangCodeISO6393 },
  glossaryPrompt?: string,
  extraHashTags: string[] = [],
): Promise<string | undefined> {
  if (!isSharedTextCacheCandidate(text)) {
    return undefined
  }

  const hashComponents = [
    SHARED_TEXT_CACHE_VERSION_TAG,
    cleanText(text),
    JSON.stringify(providerConfig),
    partialLangConfig.sourceCode,
    partialLangConfig.targetCode,
  ]

  if (isLLMProviderConfig(providerConfig)) {
    const targetLangName = LANG_CODE_TO_EN_NAME[partialLangConfig.targetCode]
    const { systemPrompt, prompt } = await getTranslatePrompt(targetLangName, text, { isBatch: true, glossaryPrompt })
    hashComponents.push(systemPrompt, prompt)
  }

  hashComponents.push(...extraHashTags)

  return Sha256Hex(...hashComponents)
}

export async function buildStableShortTextCacheKey(
  text: string,
  providerConfig: ProviderConfig,
  partialLangConfig: { sourceCode: LangCodeISO6393 | "auto", targetCode: LangCodeISO6393 },
  glossaryPrompt?: string,
  extraHashTags: string[] = [],
): Promise<string | undefined> {
  if (!isShortTextCacheCandidate(text)) {
    return undefined
  }

  return await buildSharedTextCacheKey(
    text,
    providerConfig,
    partialLangConfig,
    glossaryPrompt,
    extraHashTags,
  )
}

export async function buildPageSharedTextCacheKey(
  text: string,
  nodes: ChildNode[],
  config: Config,
  providerConfig: ProviderConfig,
  partialLangConfig: { sourceCode: LangCodeISO6393 | "auto", targetCode: LangCodeISO6393 },
  glossaryPrompt?: string,
  extraHashTags: string[] = [],
): Promise<string | undefined> {
  if (!config.translate.enableShortTextCache) {
    return undefined
  }

  if (isShortTextCacheCandidate(text)) {
    return await buildSharedTextCacheKey(
      text,
      providerConfig,
      partialLangConfig,
      glossaryPrompt,
      extraHashTags,
    )
  }

  if (!isSharedTextCacheCandidate(text)) {
    return undefined
  }

  const container = resolveLocalContextContainer(nodes, config)
  const repeatedCount = getRepeatedPageTextCount(text)
  const canShareAcrossContexts = isBoilerplateContextElement(container)
    || repeatedCount >= SHARED_TEXT_CACHE_REPETITION_THRESHOLD

  if (!canShareAcrossContexts) {
    return undefined
  }

  return await buildSharedTextCacheKey(
    text,
    providerConfig,
    partialLangConfig,
    glossaryPrompt,
    extraHashTags,
  )
}

export interface TranslateTextOptions {
  text: string
  langConfig: { sourceCode: LangCodeISO6393 | "auto", targetCode: LangCodeISO6393, level: LangLevel }
  providerConfig: ProviderConfig
  glossaryEntries?: GlossaryEntry[]
  enableShortTextCache?: boolean
  enableAIContentAware?: boolean
  aiContentAwareMode?: AIContentAwareMode
  extraHashTags?: string[]
  exactCacheContextFingerprint?: string
  pageDetectedCode?: LangCodeISO6393
  sharedCacheKey?: string
}

/**
 * Core translation function — pure, zero config fetching.
 * All dependencies must be provided explicitly.
 */
export async function translateTextCoreWithResult(options: TranslateTextOptions): Promise<TranslationResult> {
  const {
    text,
    langConfig,
    providerConfig,
    glossaryEntries = [],
    enableShortTextCache = true,
    enableAIContentAware = false,
    aiContentAwareMode = "viewport",
    extraHashTags = [],
    exactCacheContextFingerprint,
    pageDetectedCode,
    sharedCacheKey,
  } = options

  const preparedTranslation = prepareGlossaryTranslation(text, providerConfig, glossaryEntries)
  const requestText = preparedTranslation.text

  // Skip translation if text is already in target language
  if (requestText.length >= MIN_LENGTH_FOR_LANG_DETECTION) {
    const detectedLang = pageDetectedCode && pageDetectedCode !== langConfig.targetCode
      ? pageDetectedCode
      : await detectLanguageCached(requestText, {
          minLength: MIN_LENGTH_FOR_LANG_DETECTION,
        })
    if (detectedLang === langConfig.targetCode) {
      logger.info(`translateTextCore: skipping translation because text is already in target language. text: ${requestText}`)
      return { translation: "" }
    }
  }

  // Get article data for LLM providers (needed for both hash and request)
  let articleTitle: string | undefined
  let articleTextContent: string | undefined

  if (isLLMProviderConfig(providerConfig)) {
    const articleData = await getOrFetchArticleData(enableAIContentAware, aiContentAwareMode)
    if (articleData) {
      articleTitle = articleData.title
      articleTextContent = articleData.textContent
    }
  }

  const hashComponents = await buildHashComponents(
    requestText,
    providerConfig,
    { sourceCode: langConfig.sourceCode, targetCode: langConfig.targetCode },
    enableAIContentAware,
    aiContentAwareMode,
    exactCacheContextFingerprint ?? buildArticleContextFingerprint({ title: articleTitle, textContent: articleTextContent }),
    preparedTranslation.glossaryPrompt,
  )

  // Add extra hash tags for cache differentiation
  hashComponents.push(...extraHashTags)

  const stableCacheKey = !enableShortTextCache
    ? undefined
    : sharedCacheKey ?? await buildStableShortTextCacheKey(
        requestText,
        providerConfig,
        { sourceCode: langConfig.sourceCode, targetCode: langConfig.targetCode },
        preparedTranslation.glossaryPrompt,
        extraHashTags,
      )

  return await sendMessage("enqueueTranslateRequest", {
    text: requestText,
    glossaryPrompt: preparedTranslation.glossaryPrompt,
    langConfig,
    providerConfig,
    scheduleAt: Date.now(),
    hash: Sha256Hex(...hashComponents),
    stableCacheKey,
    articleTitle,
    articleTextContent,
  })
}

export async function translateTextCore(options: TranslateTextOptions): Promise<string> {
  const result = await translateTextCoreWithResult(options)
  return result.translation
}

export function validateTranslationConfigAndToast(
  config: Pick<Config, "providersConfig" | "translate" | "language">,
  detectedCode: LangCodeISO6393,
): boolean {
  const { providersConfig, translate: translateConfig, language: languageConfig } = config
  const providerConfig = getProviderConfigById(providersConfig, translateConfig.providerId)
  if (!providerConfig) {
    return false
  }

  if (languageConfig.sourceCode === languageConfig.targetCode) {
    toast.error(i18n.t("translation.sameLanguage"))
    logger.info("validateTranslationConfig: returning false (same language)")
    return false
  }
  else if (languageConfig.sourceCode === "auto" && detectedCode === languageConfig.targetCode) {
    toast.warning(i18n.t("translation.autoModeSameLanguage", [
      LANG_CODE_TO_LOCALE_NAME[detectedCode] ?? detectedCode,
    ]))
  }

  // check if the API key is configured
  if (isAPIProviderConfig(providerConfig) && !providerConfig.apiKey?.trim() && !["deeplx", "ollama", "kagi"].includes(providerConfig.provider)) {
    toast.error(i18n.t("noAPIKeyConfig.warning"))
    logger.info("validateTranslationConfig: returning false (no API key)")
    return false
  }

  return true
}
