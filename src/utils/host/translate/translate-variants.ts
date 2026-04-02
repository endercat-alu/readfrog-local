import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { Config, InputTranslationLang } from "@/types/config/config"
import type { TranslationResult } from "@/types/translation-cache"
import { isLLMProviderConfig } from "@/types/config/provider"
import { getDetectedCodeFromStorage, getFinalSourceCode } from "@/utils/config/languages"
import { getProviderConfigById } from "@/utils/config/helpers"
import { resolveProviderConfig } from "@/utils/constants/feature-providers"
import { prepareGlossaryTranslation } from "@/utils/glossary/translation"
import { logger } from "@/utils/logger"
import { getLocalConfig } from "../../config/storage"
import { shouldSkipParagraphTranslationByRules } from "./page-rules"
import { getPageTranslationRuntimeConfig } from "./runtime-config"
import { buildLocalContextFingerprint, buildPageSharedTextCacheKey, MIN_LENGTH_FOR_SKIP_LLM_DETECTION, translateTextCore, translateTextCoreWithResult } from "./translate-text"

const PAGE_TRANSLATION_VISIBLE_REQUEST_GAP_MS = 24
const PAGE_TRANSLATION_PREFETCH_BASE_DELAY_MS = 400
const PAGE_TRANSLATION_PREFETCH_REQUEST_GAP_MS = 120
const PAGE_TRANSLATION_SCHEDULER_RESET_MS = 1500

let nextVisibleTranslationScheduleAt = 0
let nextPrefetchTranslationScheduleAt = 0
let lastPageTranslationScheduleReservationAt = 0

function reservePageTranslationScheduleAt(priority?: "visible" | "prefetch"): number | undefined {
  if (!priority) {
    return undefined
  }

  const now = Date.now()
  if (now - lastPageTranslationScheduleReservationAt > PAGE_TRANSLATION_SCHEDULER_RESET_MS) {
    nextVisibleTranslationScheduleAt = now
    nextPrefetchTranslationScheduleAt = now + PAGE_TRANSLATION_PREFETCH_BASE_DELAY_MS
  }
  lastPageTranslationScheduleReservationAt = now

  if (priority === "visible") {
    const scheduleAt = Math.max(now, nextVisibleTranslationScheduleAt)
    nextVisibleTranslationScheduleAt = scheduleAt + PAGE_TRANSLATION_VISIBLE_REQUEST_GAP_MS
    nextPrefetchTranslationScheduleAt = Math.max(
      nextPrefetchTranslationScheduleAt,
      nextVisibleTranslationScheduleAt + PAGE_TRANSLATION_PREFETCH_BASE_DELAY_MS,
    )
    return scheduleAt
  }

  const scheduleAt = Math.max(
    now + PAGE_TRANSLATION_PREFETCH_BASE_DELAY_MS,
    nextPrefetchTranslationScheduleAt,
    nextVisibleTranslationScheduleAt + PAGE_TRANSLATION_PREFETCH_BASE_DELAY_MS,
  )
  nextPrefetchTranslationScheduleAt = scheduleAt + PAGE_TRANSLATION_PREFETCH_REQUEST_GAP_MS
  return scheduleAt
}

async function getConfigOrThrow(): Promise<Config> {
  const runtimeConfig = getPageTranslationRuntimeConfig()
  if (runtimeConfig) {
    return runtimeConfig
  }

  const config = await getLocalConfig()
  if (!config) {
    throw new Error("No global config when translate text")
  }
  return config
}

/**
 * Page translation — uses FEATURE_PROVIDER_DEFS['translate'].
 * Includes skip-language logic (page translation only).
 */
export async function translateTextForPage(text: string): Promise<string> {
  const result = await translateTextForPageWithResult(text)
  return result.translation
}

export async function translateTextForPageWithResult(
  text: string,
  options?: {
    nodes?: ChildNode[]
    signal?: AbortSignal
    requestPriority?: "visible" | "prefetch"
    onUpdate?: (result: TranslationResult, meta: { isFinal: boolean, source: "default" | "fast" }) => void | Promise<void>
  },
): Promise<TranslationResult> {
  const config = await getConfigOrThrow()
  const providerConfig = resolveProviderConfig(config, "translate")
  const pageDetectedCode = await getDetectedCodeFromStorage()

  if (text.length >= MIN_LENGTH_FOR_SKIP_LLM_DETECTION) {
    const shouldSkip = await shouldSkipParagraphTranslationByRules(
      text,
      typeof window !== "undefined" ? window.location.href : "",
      config,
      providerConfig,
      pageDetectedCode,
    )
    if (shouldSkip) {
      logger.info(`translateTextForPage: skipping translation because page rule matched. text: ${text}`)
      return { translation: "" }
    }
  }

  const scheduleAt = reservePageTranslationScheduleAt(options?.requestPriority)

  const createRequest = async (targetProviderConfig = providerConfig): Promise<TranslationResult> => {
    const preparedTranslation = prepareGlossaryTranslation(text, targetProviderConfig, config.glossary.entries)
    const exactCacheContextFingerprint = isLLMProviderConfig(targetProviderConfig) && options?.nodes
      ? buildLocalContextFingerprint(options.nodes, config).fingerprint
      : undefined
    const sharedCacheKey = options?.nodes
      ? await buildPageSharedTextCacheKey(
          preparedTranslation.text,
          options.nodes,
          config,
          targetProviderConfig,
          { sourceCode: config.language.sourceCode, targetCode: config.language.targetCode },
          preparedTranslation.glossaryPrompt,
        )
      : undefined

    return translateTextCoreWithResult({
      text,
      langConfig: config.language,
      providerConfig: targetProviderConfig,
      glossaryEntries: config.glossary.entries,
      enableShortTextCache: config.translate.enableShortTextCache,
      enableAIContentAware: config.translate.enableAIContentAware,
      aiContentAwareMode: config.translate.aiContentAwareMode,
      exactCacheContextFingerprint,
      pageDetectedCode,
      sharedCacheKey,
      scheduleAt,
    })
  }

  const emitUpdate = async (result: TranslationResult, meta: { isFinal: boolean, source: "default" | "fast" }) => {
    if (options?.signal?.aborted) {
      return
    }
    await options?.onUpdate?.(result, meta)
  }

  const fastTranslationConfig = config.translate.page.fastTranslation
  const fastProviderConfig = fastTranslationConfig.enabled
    ? getProviderConfigById(config.providersConfig, fastTranslationConfig.providerId)
    : undefined

  if (!fastProviderConfig || !fastProviderConfig.enabled || fastProviderConfig.id === providerConfig.id) {
    const result = await createRequest()
    await emitUpdate(result, { isFinal: true, source: "default" })
    return result
  }

  const trackResult = async (promise: Promise<TranslationResult>) => {
    try {
      return { ok: true as const, result: await promise }
    }
    catch (error) {
      return { ok: false as const, error }
    }
  }

  const defaultTrackedPromise = trackResult(createRequest())
  const fastTrackedPromise = trackResult(createRequest(fastProviderConfig))

  const firstCompleted = await Promise.race([
    defaultTrackedPromise.then(result => ({ provider: "default" as const, ...result })),
    fastTrackedPromise.then(result => ({ provider: "fast" as const, ...result })),
  ])

  const finalizeWith = async (result: TranslationResult) => {
    await emitUpdate(result, { isFinal: true, source: "default" })
    return result
  }

  if (firstCompleted.ok) {
    if (firstCompleted.provider === "default") {
      void fastTrackedPromise.then(() => {}).catch(() => {})
      return finalizeWith(firstCompleted.result)
    }

    if (!fastTranslationConfig.overwriteWithDefaultProvider) {
      void defaultTrackedPromise.then(() => {}).catch(() => {})
      await emitUpdate(firstCompleted.result, { isFinal: true, source: "fast" })
      return firstCompleted.result
    }

    if (firstCompleted.result.translation) {
      await emitUpdate(firstCompleted.result, { isFinal: false, source: "fast" })
    }

    const defaultCompleted = await defaultTrackedPromise
    if (defaultCompleted.ok) {
      return finalizeWith(defaultCompleted.result)
    }

    return finalizeWith(firstCompleted.result)
  }

  const secondCompleted = firstCompleted.provider === "default"
    ? await fastTrackedPromise
    : await defaultTrackedPromise

  if (secondCompleted.ok) {
    return finalizeWith(secondCompleted.result)
  }

  throw firstCompleted.error
}

/**
 * Selection toolbar translation — uses FEATURE_PROVIDER_DEFS['selectionToolbar.translate'].
 */
export async function translateTextForSelection(text: string): Promise<string> {
  const config = await getConfigOrThrow()
  const providerConfig = resolveProviderConfig(config, "selectionToolbar.translate")

  return translateTextCore({
    text,
    langConfig: config.language,
    extraHashTags: ["selectionTranslation"],
    providerConfig,
    glossaryEntries: config.glossary.entries,
    enableShortTextCache: config.translate.enableShortTextCache,
    enableAIContentAware: config.translate.enableAIContentAware,
    aiContentAwareMode: config.translate.aiContentAwareMode,
  })
}

async function resolveInputLang(
  lang: InputTranslationLang,
  globalLangConfig: Config["language"],
): Promise<LangCodeISO6393> {
  if (lang === "sourceCode") {
    const detectedCode = await getDetectedCodeFromStorage()
    return getFinalSourceCode(globalLangConfig.sourceCode, detectedCode)
  }
  if (lang === "targetCode") {
    return globalLangConfig.targetCode
  }
  return lang
}

/**
 * Input translation — uses FEATURE_PROVIDER_DEFS['inputTranslation'].
 */
export async function translateTextForInput(
  text: string,
  fromLang: InputTranslationLang,
  toLang: InputTranslationLang,
): Promise<string> {
  const config = await getConfigOrThrow()
  const providerConfig = resolveProviderConfig(config, "inputTranslation")

  const resolvedFromLang = await resolveInputLang(fromLang, config.language)
  const resolvedToLang = await resolveInputLang(toLang, config.language)

  if (resolvedFromLang === resolvedToLang) {
    return ""
  }

  return translateTextCore({
    text,
    langConfig: {
      sourceCode: resolvedFromLang,
      targetCode: resolvedToLang,
      level: config.language.level,
    },
    extraHashTags: [`inputTranslation:${fromLang}->${toLang}`],
    providerConfig,
    glossaryEntries: config.glossary.entries,
    enableShortTextCache: config.translate.enableShortTextCache,
    enableAIContentAware: config.translate.enableAIContentAware,
    aiContentAwareMode: config.translate.aiContentAwareMode,
  })
}
