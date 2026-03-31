import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { Config, InputTranslationLang } from "@/types/config/config"
import type { TranslationResult } from "@/types/translation-cache"
import { isLLMProviderConfig } from "@/types/config/provider"
import { getDetectedCodeFromStorage, getFinalSourceCode } from "@/utils/config/languages"
import { resolveProviderConfig } from "@/utils/constants/feature-providers"
import { prepareGlossaryTranslation } from "@/utils/glossary/translation"
import { logger } from "@/utils/logger"
import { getLocalConfig } from "../../config/storage"
import { getPageTranslationRuntimeConfig } from "./runtime-config"
import { buildLocalContextFingerprint, buildPageSharedTextCacheKey, MIN_LENGTH_FOR_SKIP_LLM_DETECTION, shouldSkipByLanguage, translateTextCore, translateTextCoreWithResult } from "./translate-text"

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
  },
): Promise<TranslationResult> {
  const config = await getConfigOrThrow()
  const providerConfig = resolveProviderConfig(config, "translate")
  const pageDetectedCode = await getDetectedCodeFromStorage()

  // Skip translation if text is in skipLanguages list (page translation only)
  const { skipLanguages, enableSkipLanguagesLLMDetection } = config.translate.page
  if (skipLanguages.length > 0 && text.length >= MIN_LENGTH_FOR_SKIP_LLM_DETECTION) {
    const shouldSkip = skipLanguages.includes(pageDetectedCode)
      || await shouldSkipByLanguage(
        text,
        skipLanguages,
        enableSkipLanguagesLLMDetection,
        providerConfig,
        pageDetectedCode,
      )
    if (shouldSkip) {
      logger.info(`translateTextForPage: skipping translation because text is in skip language list. text: ${text}`)
      return { translation: "" }
    }
  }

  const preparedTranslation = prepareGlossaryTranslation(text, providerConfig, config.glossary.entries)
  const exactCacheContextFingerprint = isLLMProviderConfig(providerConfig) && options?.nodes
    ? buildLocalContextFingerprint(options.nodes, config).fingerprint
    : undefined
  const sharedCacheKey = options?.nodes
    ? await buildPageSharedTextCacheKey(
        preparedTranslation.text,
        options.nodes,
        config,
        providerConfig,
        { sourceCode: config.language.sourceCode, targetCode: config.language.targetCode },
        preparedTranslation.glossaryPrompt,
      )
    : undefined

  return translateTextCoreWithResult({
    text,
    langConfig: config.language,
    providerConfig,
    glossaryEntries: config.glossary.entries,
    enableShortTextCache: config.translate.enableShortTextCache,
    enableAIContentAware: config.translate.enableAIContentAware,
    aiContentAwareMode: config.translate.aiContentAwareMode,
    exactCacheContextFingerprint,
    pageDetectedCode,
    sharedCacheKey,
  })
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
