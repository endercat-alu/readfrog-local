import type { SubtitlesFragment } from "../types"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { i18n } from "#imports"
import { APICallError } from "ai"
import { getProviderConfigById } from "@/utils/config/helpers"
import { getLocalConfig } from "@/utils/config/storage"
import { prepareGlossaryTranslation } from "@/utils/glossary/translation"
import { Sha256Hex } from "@/utils/hash"
import { buildArticleContextFingerprint, buildHashComponents, buildStableShortTextCacheKey } from "@/utils/host/translate/translate-text"
import { sendMessage } from "@/utils/message"

function toFriendlyErrorMessage(error: unknown): string {
  if (error instanceof APICallError) {
    switch (error.statusCode) {
      case 429:
        return i18n.t("subtitles.errors.aiRateLimited")
      case 401:
      case 403:
        return i18n.t("subtitles.errors.aiAuthFailed")
      case 500:
      case 502:
      case 503:
        return i18n.t("subtitles.errors.aiServiceUnavailable")
    }
  }

  const message = error instanceof Error ? error.message : String(error)

  if (message.includes("No Response") || message.includes("Empty response")) {
    return i18n.t("subtitles.errors.aiNoResponse")
  }

  return message
}

export interface SubtitlesVideoContext {
  videoTitle: string
  subtitlesTextContent: string
}

async function translateSingleSubtitle(
  text: string,
  langConfig: Config["language"],
  providerConfig: ProviderConfig,
  enableShortTextCache: boolean,
  enableAIContentAware: boolean,
  videoContext: SubtitlesVideoContext,
  glossaryEntries: Config["glossary"]["entries"],
): Promise<string> {
  const preparedTranslation = prepareGlossaryTranslation(text, providerConfig, glossaryEntries)
  const hashComponents = await buildHashComponents(
    preparedTranslation.text,
    providerConfig,
    { sourceCode: langConfig.sourceCode, targetCode: langConfig.targetCode },
    enableAIContentAware,
    "document",
    buildArticleContextFingerprint({ title: videoContext.videoTitle, textContent: videoContext.subtitlesTextContent }),
    preparedTranslation.glossaryPrompt,
  )
  const stableCacheKey = enableShortTextCache
    ? await buildStableShortTextCacheKey(
        preparedTranslation.text,
        providerConfig,
        { sourceCode: langConfig.sourceCode, targetCode: langConfig.targetCode },
        preparedTranslation.glossaryPrompt,
      )
    : undefined

  const result = await sendMessage("enqueueSubtitlesTranslateRequest", {
    text: preparedTranslation.text,
    glossaryPrompt: preparedTranslation.glossaryPrompt,
    langConfig,
    providerConfig,
    scheduleAt: Date.now(),
    hash: Sha256Hex(...hashComponents),
    stableCacheKey,
    videoTitle: enableAIContentAware ? videoContext.videoTitle : "",
    subtitlesContext: enableAIContentAware ? videoContext.subtitlesTextContent : "",
  })

  return result.translation
}

export async function translateSubtitles(
  fragments: SubtitlesFragment[],
  videoContext: SubtitlesVideoContext,
): Promise<SubtitlesFragment[]> {
  const config = await getLocalConfig()
  if (!config) {
    return fragments.map(f => ({ ...f, translation: "" }))
  }

  const providerConfig = getProviderConfigById(config.providersConfig, config.videoSubtitles.providerId)

  if (!providerConfig) {
    return fragments.map(f => ({ ...f, translation: "" }))
  }

  const langConfig = config.language
  const enableShortTextCache = !!config.translate.enableShortTextCache
  const enableAIContentAware = !!config.translate.enableAIContentAware
  const glossaryEntries = config.glossary.entries

  const translationPromises = fragments.map(fragment =>
    translateSingleSubtitle(fragment.text, langConfig, providerConfig, enableShortTextCache, enableAIContentAware, videoContext, glossaryEntries),
  )

  const results = await Promise.allSettled(translationPromises)

  // If all translations failed, throw with friendly error message
  const allRejected = results.every((r): r is PromiseRejectedResult => r.status === "rejected")
  if (allRejected && results.length) {
    throw new Error(toFriendlyErrorMessage(results[0].reason))
  }

  return fragments.map((fragment, index) => {
    const result = results[index]
    return {
      ...fragment,
      translation: result.status === "fulfilled" ? result.value : "",
    }
  })
}
