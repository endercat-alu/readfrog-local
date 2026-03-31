import type { LangCodeISO6393 } from "@read-frog/definitions"
import type {
  BackgroundGenerateTextPayload,
  BackgroundGenerateTextResponse,
} from "@/types/background-generate-text"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type { BatchQueueConfig, RequestQueueConfig } from "@/types/config/translate"
import type {
  EdgeTTSHealthStatus,
  EdgeTTSSynthesizeRequest,
  EdgeTTSSynthesizeWireResponse,
} from "@/types/edge-tts"
import type { ProxyRequest, ProxyResponse } from "@/types/proxy-fetch"
import type { PureAPIProviderConfig } from "@/types/config/provider"
import type { TranslationCacheInspection, TranslationCacheOverview } from "@/types/cache-inspector"
import type { TranslationResult } from "@/types/translation-cache"
import type {
  TTSOffscreenStopRequest,
  TTSPlaybackStartRequest,
  TTSPlaybackStartResponse,
  TTSPlaybackStopRequest,
} from "@/types/tts-playback"
import type { EdgeTTSVoice } from "@/utils/server/edge-tts/types"
import { defineExtensionMessaging } from "@webext-core/messaging"

interface ProtocolMap {
  // navigation
  openPage: (data: { url: string, active?: boolean }) => void
  openOptionsPage: () => void
  // config
  getInitialConfig: () => Config | null
  // translation state
  getEnablePageTranslationByTabId: (data: { tabId: number }) => boolean | undefined
  getEnablePageTranslationFromContentScript: () => Promise<boolean>
  tryToSetEnablePageTranslationByTabId: (data: { tabId: number, enabled: boolean }) => void
  tryToSetEnablePageTranslationOnContentScript: (data: { enabled: boolean }) => void
  getCacheHighlightStateByTabId: (data: { tabId: number }) => boolean | undefined
  getCacheHighlightStateFromContentScript: () => Promise<boolean>
  tryToSetCacheHighlightStateByTabId: (data: { tabId: number, enabled: boolean }) => void
  tryToSetCacheHighlightStateOnContentScript: (data: { enabled: boolean }) => void
  openSelectionToolbarFeatureFromContextMenu: (data: { feature: "translate" | "vocabularyInsight" | "dictionary" }) => void
  setAndNotifyPageTranslationStateChangedByManager: (data: { enabled: boolean }) => void
  notifyTranslationStateChanged: (data: { enabled: boolean }) => void
  notifyCacheHighlightStateChanged: (data: { enabled: boolean }) => void
  // for auto start page translation
  checkAndAskAutoPageTranslation: (data: { url: string, detectedCodeOrUnd: LangCodeISO6393 | "und" }) => void
  // ask host to start page translation
  askManagerToTogglePageTranslation: (data: { enabled: boolean }) => void
  // user guide
  pinStateChanged: (data: { isPinned: boolean }) => void
  getPinState: () => boolean
  returnPinState: (data: { isPinned: boolean }) => void
  // request
  enqueueTranslateRequest: (data: { text: string, glossaryPrompt?: string, langConfig: Config["language"], providerConfig: ProviderConfig, scheduleAt: number, hash: string, stableCacheKey?: string, articleTitle?: string, articleTextContent?: string }) => Promise<TranslationResult>
  enqueueSubtitlesTranslateRequest: (data: { text: string, glossaryPrompt?: string, langConfig: Config["language"], providerConfig: ProviderConfig, scheduleAt: number, hash: string, stableCacheKey?: string, videoTitle?: string, subtitlesContext?: string }) => Promise<TranslationResult>
  backgroundGenerateText: (data: BackgroundGenerateTextPayload) => Promise<BackgroundGenerateTextResponse>
  // AI subtitle segmentation
  aiSegmentSubtitles: (data: { jsonContent: string, providerId: string }) => Promise<string>
  setTranslateRequestQueueConfig: (data: Partial<RequestQueueConfig>) => void
  setTranslateBatchQueueConfig: (data: Partial<BatchQueueConfig>) => void
  // Subtitle-specific queue config messages
  setSubtitlesRequestQueueConfig: (data: Partial<RequestQueueConfig>) => void
  setSubtitlesBatchQueueConfig: (data: Partial<BatchQueueConfig>) => void
  // network proxy
  backgroundFetch: (data: ProxyRequest) => Promise<ProxyResponse>
  kagiTranslate: (data: {
    sourceText: string
    fromLang: string
    toLang: string
    providerConfig: PureAPIProviderConfig
    options?: {
      isBatch?: boolean
    }
  }) => Promise<string>
  // cache management
  clearAllTranslationRelatedCache: () => Promise<void>
  clearAiSegmentationCache: () => Promise<void>
  getTranslationCacheOverview: (data: { rangeKey: "1H" | "12H" | "1D" | "7D" | "14D" }) => Promise<TranslationCacheOverview>
  inspectTranslationCacheLayer: (data: { layer: "l1" | "l2", limit?: number }) => Promise<TranslationCacheInspection>
  // edge tts
  edgeTtsSynthesize: (data: EdgeTTSSynthesizeRequest) => Promise<EdgeTTSSynthesizeWireResponse>
  edgeTtsListVoices: () => Promise<EdgeTTSVoice[]>
  edgeTtsHealthCheck: () => Promise<EdgeTTSHealthStatus>
  // tts playback
  ttsPlaybackEnsureOffscreen: () => Promise<{ ok: true }>
  ttsPlaybackStart: (data: TTSPlaybackStartRequest) => Promise<TTSPlaybackStartResponse>
  ttsPlaybackStop: (data: TTSPlaybackStopRequest) => Promise<{ ok: true }>
  // offscreen internal
  ttsOffscreenPlay: (data: TTSPlaybackStartRequest) => Promise<TTSPlaybackStartResponse>
  ttsOffscreenStop: (data: TTSOffscreenStopRequest) => Promise<{ ok: true }>
}

export const { sendMessage, onMessage }
  = defineExtensionMessaging<ProtocolMap>()
