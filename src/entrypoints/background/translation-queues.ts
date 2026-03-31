import type { Config } from "@/types/config/config"
import type { LLMProviderConfig, ProviderConfig } from "@/types/config/provider"
import type { TranslationCacheHit, TranslationResult } from "@/types/translation-cache"
import type { BatchQueueConfig, RequestQueueConfig } from "@/types/config/translate"
import type { ArticleContent } from "@/types/content"
import type { TranslationCacheInspection, TranslationCacheOverview, TranslationCacheTablePreview } from "@/types/cache-inspector"
import type { PromptResolver } from "@/utils/host/translate/api/ai"
import { isLLMProviderConfig } from "@/types/config/provider"
import { putBatchRequestRecord } from "@/utils/batch-request-record"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { BATCH_SEPARATOR } from "@/utils/constants/prompt"
import { LruTtlCache } from "@/utils/cache/lru-ttl-cache"
import { generateArticleSummary } from "@/utils/content/summary"
import { cleanText } from "@/utils/content/utils"
import { db } from "@/utils/db/dexie/db"
import { Sha256Hex } from "@/utils/hash"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"
import { getSubtitlesTranslatePrompt } from "@/utils/prompts/subtitles"
import { getTranslatePrompt } from "@/utils/prompts/translate"
import { BatchQueue } from "@/utils/request/batch-queue"
import { RequestQueue } from "@/utils/request/request-queue"
import { ensureInitializedConfig } from "./config"

const TRANSLATION_MEMORY_CACHE_MAX_SIZE = 4000
const TRANSLATION_MEMORY_CACHE_TTL_MS = 30 * 60 * 1000
const CACHE_INSPECTION_LIMIT = 50
const TRANSLATION_PERSIST_FLUSH_DELAY_MS = 300
const TRANSLATION_PERSIST_FLUSH_BATCH_SIZE = 20
const CACHE_STATS_FLUSH_DELAY_MS = 1000
const CACHE_STATS_BUCKET_MS = 60 * 1000

type CacheRangeKey = "1H" | "12H" | "1D" | "7D" | "14D"
type CacheAccessEventType = "exactL1Hit" | "exactL2Hit" | "stableL1Hit" | "stableL2Hit" | "miss"
type PendingTranslationWrite = {
  key: string
  createdAt: Date
  translation: string
}
type CacheStatsBucketInput = {
  key: string
  bucketStart: Date
  exactL1Hits: number
  exactL2Hits: number
  stableL1Hits: number
  stableL2Hits: number
  misses: number
}

const exactTranslationMemoryCache = new LruTtlCache<string, string>(
  TRANSLATION_MEMORY_CACHE_MAX_SIZE,
  TRANSLATION_MEMORY_CACHE_TTL_MS,
)
const stableTranslationMemoryCache = new LruTtlCache<string, string>(
  TRANSLATION_MEMORY_CACHE_MAX_SIZE,
  TRANSLATION_MEMORY_CACHE_TTL_MS,
)

const pendingExactTranslationWrites = new Map<string, PendingTranslationWrite>()
const pendingStableTranslationWrites = new Map<string, PendingTranslationWrite>()
const pendingCacheStatsBuckets = new Map<string, CacheStatsBucketInput>()
let translationPersistFlushTimer: ReturnType<typeof setTimeout> | null = null
let translationPersistFlushPromise: Promise<void> | null = null
let cacheStatsFlushTimer: ReturnType<typeof setTimeout> | null = null
let cacheStatsFlushPromise: Promise<void> | null = null

export function parseBatchResult(result: string): string[] {
  return result.split(BATCH_SEPARATOR).map(t => t.trim())
}

function getFromMemoryCache(hash?: string): string | undefined {
  if (!hash) {
    return undefined
  }
  return exactTranslationMemoryCache.get(hash)
}

function createTranslationResult(
  translation: string,
  cacheHit?: TranslationCacheHit,
): TranslationResult {
  return {
    translation,
    cacheHit,
  }
}

function createEmptyCacheStatsBucket(bucketStart: Date): CacheStatsBucketInput {
  return {
    key: String(bucketStart.getTime()),
    bucketStart,
    exactL1Hits: 0,
    exactL2Hits: 0,
    stableL1Hits: 0,
    stableL2Hits: 0,
    misses: 0,
  }
}

function mergeCacheStatsBucket(target: CacheStatsBucketInput, source: CacheStatsBucketInput) {
  target.exactL1Hits += source.exactL1Hits
  target.exactL2Hits += source.exactL2Hits
  target.stableL1Hits += source.stableL1Hits
  target.stableL2Hits += source.stableL2Hits
  target.misses += source.misses
}

function getCacheStatsBucketStart(timestamp: number = Date.now()): Date {
  return new Date(Math.floor(timestamp / CACHE_STATS_BUCKET_MS) * CACHE_STATS_BUCKET_MS)
}

function scheduleTranslationPersistFlush() {
  if (pendingExactTranslationWrites.size + pendingStableTranslationWrites.size >= TRANSLATION_PERSIST_FLUSH_BATCH_SIZE) {
    void flushPendingTranslationWrites()
    return
  }

  if (!translationPersistFlushTimer) {
    translationPersistFlushTimer = setTimeout(() => {
      translationPersistFlushTimer = null
      void flushPendingTranslationWrites()
    }, TRANSLATION_PERSIST_FLUSH_DELAY_MS)
  }
}

async function flushPendingTranslationWrites(): Promise<void> {
  if (translationPersistFlushTimer) {
    clearTimeout(translationPersistFlushTimer)
    translationPersistFlushTimer = null
  }

  if (translationPersistFlushPromise) {
    await translationPersistFlushPromise
  }

  if (pendingExactTranslationWrites.size === 0 && pendingStableTranslationWrites.size === 0) {
    return
  }

  const exactEntries = Array.from(pendingExactTranslationWrites.values())
  const stableEntries = Array.from(pendingStableTranslationWrites.values())
  pendingExactTranslationWrites.clear()
  pendingStableTranslationWrites.clear()

  translationPersistFlushPromise = (async () => {
    try {
      await Promise.all([
        exactEntries.length > 0 ? db.translationCache.bulkPut(exactEntries) : Promise.resolve(),
        stableEntries.length > 0 ? db.stableTranslationCache.bulkPut(stableEntries) : Promise.resolve(),
      ])
    }
    catch (error) {
      for (const entry of exactEntries) {
        pendingExactTranslationWrites.set(entry.key, entry)
      }
      for (const entry of stableEntries) {
        pendingStableTranslationWrites.set(entry.key, entry)
      }
      logger.warn("Failed to flush pending translation cache writes:", error)
    }
    finally {
      translationPersistFlushPromise = null
      if (pendingExactTranslationWrites.size > 0 || pendingStableTranslationWrites.size > 0) {
        scheduleTranslationPersistFlush()
      }
    }
  })()

  await translationPersistFlushPromise
}

function enqueueCacheAccessEvent(eventType: CacheAccessEventType) {
  const bucketStart = getCacheStatsBucketStart()
  const bucketKey = String(bucketStart.getTime())
  const bucket = pendingCacheStatsBuckets.get(bucketKey) ?? createEmptyCacheStatsBucket(bucketStart)
  pendingCacheStatsBuckets.set(bucketKey, bucket)

  switch (eventType) {
    case "exactL1Hit":
      bucket.exactL1Hits++
      break
    case "exactL2Hit":
      bucket.exactL2Hits++
      break
    case "stableL1Hit":
      bucket.stableL1Hits++
      break
    case "stableL2Hit":
      bucket.stableL2Hits++
      break
    case "miss":
      bucket.misses++
      break
  }

  if (pendingCacheStatsBuckets.size >= 4) {
    void flushCacheAccessEvents()
    return
  }

  if (!cacheStatsFlushTimer) {
    cacheStatsFlushTimer = setTimeout(() => {
      cacheStatsFlushTimer = null
      void flushCacheAccessEvents()
    }, CACHE_STATS_FLUSH_DELAY_MS)
  }
}

async function flushCacheAccessEvents(): Promise<void> {
  if (cacheStatsFlushTimer) {
    clearTimeout(cacheStatsFlushTimer)
    cacheStatsFlushTimer = null
  }

  if (cacheStatsFlushPromise) {
    await cacheStatsFlushPromise
  }

  if (pendingCacheStatsBuckets.size === 0) {
    return
  }

  const pendingBuckets = Array.from(pendingCacheStatsBuckets.values())
  pendingCacheStatsBuckets.clear()

  cacheStatsFlushPromise = (async () => {
    try {
      const existingBuckets = await db.cacheAccessBucket.bulkGet(pendingBuckets.map(bucket => bucket.key))
      const nextBuckets = pendingBuckets.map((bucket, index) => {
        const existingBucket = existingBuckets[index]
        if (!existingBucket) {
          return bucket
        }

        const mergedBucket: CacheStatsBucketInput = {
          key: existingBucket.key,
          bucketStart: existingBucket.bucketStart,
          exactL1Hits: existingBucket.exactL1Hits,
          exactL2Hits: existingBucket.exactL2Hits,
          stableL1Hits: existingBucket.stableL1Hits,
          stableL2Hits: existingBucket.stableL2Hits,
          misses: existingBucket.misses,
        }
        mergeCacheStatsBucket(mergedBucket, bucket)
        return mergedBucket
      })

      await db.cacheAccessBucket.bulkPut(nextBuckets)
    }
    catch (error) {
      for (const bucket of pendingBuckets) {
        const existingBucket = pendingCacheStatsBuckets.get(bucket.key)
        if (existingBucket) {
          mergeCacheStatsBucket(existingBucket, bucket)
        }
        else {
          pendingCacheStatsBuckets.set(bucket.key, bucket)
        }
      }
      logger.warn("Failed to flush cache stats buckets:", error)
    }
    finally {
      cacheStatsFlushPromise = null
      if (pendingCacheStatsBuckets.size > 0) {
        if (!cacheStatsFlushTimer) {
          cacheStatsFlushTimer = setTimeout(() => {
            cacheStatsFlushTimer = null
            void flushCacheAccessEvents()
          }, CACHE_STATS_FLUSH_DELAY_MS)
        }
      }
    }
  })()

  await cacheStatsFlushPromise
}

function getRangeMeta(rangeKey: CacheRangeKey) {
  const endAt = Date.now()
  const durationMs = {
    "1H": 60 * 60 * 1000,
    "12H": 12 * 60 * 60 * 1000,
    "1D": 24 * 60 * 60 * 1000,
    "7D": 7 * 24 * 60 * 60 * 1000,
    "14D": 14 * 24 * 60 * 60 * 1000,
  }[rangeKey]

  return {
    key: rangeKey,
    label: rangeKey,
    startAt: endAt - durationMs,
    endAt,
  }
}

function setExactTranslationCache(hash: string | undefined, translation: string): void {
  if (!hash || !translation) {
    return
  }
  exactTranslationMemoryCache.set(hash, translation)
}

function setStableTranslationCache(stableCacheKey: string | undefined, translation: string): void {
  if (!stableCacheKey || !translation) {
    return
  }
  stableTranslationMemoryCache.set(stableCacheKey, translation)
}

async function getCachedTranslation(hash?: string): Promise<TranslationResult | undefined> {
  const memoryCached = getFromMemoryCache(hash)
  if (memoryCached) {
    enqueueCacheAccessEvent("exactL1Hit")
    return createTranslationResult(memoryCached, { layer: "l1", cacheType: "exact" })
  }

  if (!hash) {
    return undefined
  }

  const persisted = await db.translationCache.get(hash)
  if (!persisted) {
    return undefined
  }

  exactTranslationMemoryCache.set(hash, persisted.translation)
  enqueueCacheAccessEvent("exactL2Hit")
  return createTranslationResult(persisted.translation, { layer: "l2", cacheType: "exact" })
}

async function getCachedStableTranslation(stableCacheKey?: string): Promise<TranslationResult | undefined> {
  if (!stableCacheKey) {
    return undefined
  }

  const memoryCached = stableTranslationMemoryCache.get(stableCacheKey)
  if (memoryCached) {
    enqueueCacheAccessEvent("stableL1Hit")
    return createTranslationResult(memoryCached, { layer: "l1", cacheType: "stable" })
  }

  const persisted = await db.stableTranslationCache.get(stableCacheKey)
  if (!persisted) {
    return undefined
  }

  stableTranslationMemoryCache.set(stableCacheKey, persisted.translation)
  enqueueCacheAccessEvent("stableL2Hit")
  return createTranslationResult(persisted.translation, { layer: "l2", cacheType: "stable" })
}

function persistTranslationResult(hash: string | undefined, stableCacheKey: string | undefined, translation: string): void {
  if (!translation) {
    return
  }

  setExactTranslationCache(hash, translation)
  setStableTranslationCache(stableCacheKey, translation)

  const createdAt = new Date()
  if (hash) {
    pendingExactTranslationWrites.set(hash, {
      key: hash,
      translation,
      createdAt,
    })
  }

  if (stableCacheKey) {
    pendingStableTranslationWrites.set(stableCacheKey, {
      key: stableCacheKey,
      translation,
      createdAt,
    })
  }

  if (hash || stableCacheKey) {
    scheduleTranslationPersistFlush()
  }
}

export function clearTranslationMemoryCaches() {
  exactTranslationMemoryCache.clear()
  stableTranslationMemoryCache.clear()
  pendingExactTranslationWrites.clear()
  pendingStableTranslationWrites.clear()

  if (translationPersistFlushTimer) {
    clearTimeout(translationPersistFlushTimer)
    translationPersistFlushTimer = null
  }
}

function createEmptyStats() {
  return {
    totalRequests: 0,
    totalHits: 0,
    totalMisses: 0,
    hitRate: 0,
    exactL1Hits: 0,
    exactL2Hits: 0,
    stableL1Hits: 0,
    stableL2Hits: 0,
  }
}

async function getTranslationCacheOverview(rangeKey: CacheRangeKey): Promise<TranslationCacheOverview> {
  await Promise.all([
    flushPendingTranslationWrites(),
    flushCacheAccessEvents(),
  ])
  const range = getRangeMeta(rangeKey)
  const bucketQueryStart = new Date(range.startAt - CACHE_STATS_BUCKET_MS)

  const [l2ExactCount, l2StableCount, l2SummaryCount, bucketRecords, legacyRecords] = await Promise.all([
    db.translationCache.count(),
    db.stableTranslationCache.count(),
    db.articleSummaryCache.count(),
    db.cacheAccessBucket.where("bucketStart").between(bucketQueryStart, new Date(range.endAt), true, true).toArray(),
    db.cacheAccessRecord.where("createdAt").between(new Date(range.startAt), new Date(range.endAt), true, true).toArray(),
  ])

  const stats = createEmptyStats()
  for (const bucket of bucketRecords) {
    stats.exactL1Hits += bucket.exactL1Hits
    stats.exactL2Hits += bucket.exactL2Hits
    stats.stableL1Hits += bucket.stableL1Hits
    stats.stableL2Hits += bucket.stableL2Hits
    stats.totalMisses += bucket.misses
  }

  for (const record of legacyRecords) {
    switch (record.eventType) {
      case "exactL1Hit":
        stats.exactL1Hits++
        break
      case "exactL2Hit":
        stats.exactL2Hits++
        break
      case "stableL1Hit":
        stats.stableL1Hits++
        break
      case "stableL2Hit":
        stats.stableL2Hits++
        break
      case "miss":
        stats.totalMisses++
        break
    }
  }

  stats.totalHits = stats.exactL1Hits + stats.exactL2Hits + stats.stableL1Hits + stats.stableL2Hits
  stats.totalRequests = stats.totalHits + stats.totalMisses
  stats.hitRate = stats.totalRequests > 0 ? stats.totalHits / stats.totalRequests : 0

  return {
    generatedAt: Date.now(),
    range,
    stats,
    tables: {
      l1ExactCount: exactTranslationMemoryCache.count(),
      l1StableCount: stableTranslationMemoryCache.count(),
      l2ExactCount,
      l2StableCount,
      l2SummaryCount,
    },
  }
}

function createL1TablePreview(
  id: string,
  title: string,
  cache: LruTtlCache<string, string>,
  limit: number,
): TranslationCacheTablePreview {
  const count = cache.count()
  return {
    id,
    title,
    count,
    limited: count > limit,
    entries: cache.snapshotEntries(limit).map(entry => ({
      key: entry.key,
      value: entry.value,
      expiresAt: entry.expiresAt,
    })),
  }
}

async function getTranslationCacheInspection(layer: "l1" | "l2", limit: number = CACHE_INSPECTION_LIMIT): Promise<TranslationCacheInspection> {
  if (layer === "l1") {
    return {
      generatedAt: Date.now(),
      layer,
      limit,
      tables: [
        createL1TablePreview("l1-exact", "L1 Exact Translation Cache", exactTranslationMemoryCache, limit),
        createL1TablePreview("l1-stable", "L1 Shared Text Cache", stableTranslationMemoryCache, limit),
      ],
    }
  }

  await flushPendingTranslationWrites()

  const [exactCount, stableCount, summaryCount, exactEntries, stableEntries, summaryEntries] = await Promise.all([
    db.translationCache.count(),
    db.stableTranslationCache.count(),
    db.articleSummaryCache.count(),
    db.translationCache.orderBy("createdAt").reverse().limit(limit).toArray(),
    db.stableTranslationCache.orderBy("createdAt").reverse().limit(limit).toArray(),
    db.articleSummaryCache.orderBy("createdAt").reverse().limit(limit).toArray(),
  ])

  return {
    generatedAt: Date.now(),
    layer,
    limit,
    tables: [
      {
        id: "l2-exact",
        title: "L2 Exact Translation Cache",
        count: exactCount,
        limited: exactCount > limit,
        entries: exactEntries.map(entry => ({
          key: entry.key,
          value: entry.translation,
          createdAt: entry.createdAt?.getTime(),
        })),
      },
      {
        id: "l2-stable",
        title: "L2 Shared Text Cache",
        count: stableCount,
        limited: stableCount > limit,
        entries: stableEntries.map(entry => ({
          key: entry.key,
          value: entry.translation,
          createdAt: entry.createdAt?.getTime(),
        })),
      },
      {
        id: "l2-summary",
        title: "L2 Article Summary Cache",
        count: summaryCount,
        limited: summaryCount > limit,
        entries: summaryEntries.map(entry => ({
          key: entry.key,
          value: entry.summary,
          createdAt: entry.createdAt?.getTime(),
        })),
      },
    ],
  }
}

async function getOrGenerateSummary(
  title: string,
  textContent: string,
  providerConfig: LLMProviderConfig,
  requestQueue: RequestQueue,
): Promise<string | undefined> {
  const preparedText = cleanText(textContent)
  if (!preparedText) {
    return undefined
  }

  const textHash = Sha256Hex(preparedText)
  const cacheKey = Sha256Hex(textHash, JSON.stringify(providerConfig))

  const cached = await db.articleSummaryCache.get(cacheKey)
  if (cached) {
    logger.info("Using cached summary")
    return cached.summary
  }

  const thunk = async () => {
    const cachedAgain = await db.articleSummaryCache.get(cacheKey)
    if (cachedAgain) {
      return cachedAgain.summary
    }

    const summary = await generateArticleSummary(title, textContent, providerConfig)
    if (!summary) {
      return ""
    }

    await db.articleSummaryCache.put({
      key: cacheKey,
      summary,
      createdAt: new Date(),
    })

    logger.info("Generated and cached new summary")
    return summary
  }

  try {
    const summary = await requestQueue.enqueue(thunk, Date.now(), cacheKey)
    return summary || undefined
  }
  catch (error) {
    logger.warn("Failed to get/generate summary:", error)
    return undefined
  }
}

interface TranslateBatchData {
  text: string
  glossaryPrompt?: string
  langConfig: Config["language"]
  providerConfig: ProviderConfig
  hash: string
  scheduleAt: number
  content?: ArticleContent
}

interface TranslationQueueSetupConfig {
  requestQueueConfig: RequestQueueConfig
  batchQueueConfig: BatchQueueConfig
  promptResolver: PromptResolver
}

async function createTranslationQueues(config: TranslationQueueSetupConfig) {
  const { rate, capacity } = config.requestQueueConfig
  const { maxCharactersPerBatch, maxItemsPerBatch } = config.batchQueueConfig
  const { promptResolver } = config

  const requestQueue = new RequestQueue({
    rate,
    capacity,
    timeoutMs: 20_000,
    maxRetries: 2,
    baseRetryDelayMs: 1_000,
  })

  const batchQueue = new BatchQueue<TranslateBatchData, string>({
    maxCharactersPerBatch,
    maxItemsPerBatch,
    batchDelay: 100,
    maxRetries: 3,
    enableFallbackToIndividual: true,
    getBatchKey: (data) => {
      return Sha256Hex(
        `${data.langConfig.sourceCode}-${data.langConfig.targetCode}-${data.providerConfig.id}`,
        data.glossaryPrompt || "",
      )
    },
    getCharacters: data => data.text.length,
    executeBatch: async (dataList) => {
      const { langConfig, providerConfig, content, glossaryPrompt } = dataList[0]
      const texts = dataList.map(d => d.text)
      const batchText = texts.join(`\n\n${BATCH_SEPARATOR}\n\n`)
      const hash = Sha256Hex(...dataList.map(d => d.hash))
      const earliestScheduleAt = Math.min(...dataList.map(d => d.scheduleAt))

      const batchThunk = async (): Promise<string[]> => {
        await putBatchRequestRecord({ originalRequestCount: dataList.length, providerConfig })
        const result = await executeTranslate(batchText, langConfig, providerConfig, promptResolver, {
          isBatch: true,
          runInBackground: true,
          content,
          glossaryPrompt,
        })
        return parseBatchResult(result)
      }

      return requestQueue.enqueue(batchThunk, earliestScheduleAt, hash)
    },
    executeIndividual: async (data) => {
      const { text, langConfig, providerConfig, hash, scheduleAt, content, glossaryPrompt } = data
      const thunk = async () => {
        await putBatchRequestRecord({ originalRequestCount: 1, providerConfig })
        return executeTranslate(text, langConfig, providerConfig, promptResolver, { content, glossaryPrompt, runInBackground: true })
      }
      return requestQueue.enqueue(thunk, scheduleAt, hash)
    },
    onError: (error, context) => {
      const errorType = context.isFallback ? "Individual request" : "Batch request"
      logger.error(
        `${errorType} failed (batchKey: ${context.batchKey}, retry: ${context.retryCount}):`,
        error.message,
      )
    },
  })

  return { requestQueue, batchQueue }
}

export async function setUpWebPageTranslationQueue() {
  const config = await ensureInitializedConfig()

  const { translate: { requestQueueConfig, batchQueueConfig } } = config ?? DEFAULT_CONFIG

  const { requestQueue, batchQueue } = await createTranslationQueues({
    requestQueueConfig,
    batchQueueConfig,
    promptResolver: getTranslatePrompt,
  })

  onMessage("enqueueTranslateRequest", async (message) => {
    const { data: { text, glossaryPrompt, langConfig, providerConfig, scheduleAt, hash, stableCacheKey, articleTitle, articleTextContent } } = message

    const exactCached = await getCachedTranslation(hash)
    if (exactCached) {
      return exactCached
    }

    const stableCached = await getCachedStableTranslation(stableCacheKey)
    if (stableCached) {
      setExactTranslationCache(hash, stableCached.translation)
      return stableCached
    }

    enqueueCacheAccessEvent("miss")

    let result = ""
    const content: ArticleContent = {
      title: articleTitle || "",
    }

    if (isLLMProviderConfig(providerConfig)) {
      // Generate or fetch cached summary if AI Content Aware is enabled
      const config = await ensureInitializedConfig()
      if (config?.translate.enableAIContentAware && articleTitle !== undefined && articleTextContent !== undefined) {
        content.summary = await getOrGenerateSummary(articleTitle, articleTextContent, providerConfig, requestQueue)
      }

      const data = { text, glossaryPrompt, langConfig, providerConfig, hash, scheduleAt, content }
      result = await batchQueue.enqueue(data)
    }
    else {
      // Create thunk based on type and params
      const thunk = () => executeTranslate(text, langConfig, providerConfig, getTranslatePrompt, { glossaryPrompt, runInBackground: true })
      result = await requestQueue.enqueue(thunk, scheduleAt, hash)
    }

    // Cache the translation result if successful
    persistTranslationResult(hash, stableCacheKey, result)

    return createTranslationResult(result)
  })

  onMessage("setTranslateRequestQueueConfig", (message) => {
    const { data } = message
    requestQueue.setQueueOptions(data)
  })

  onMessage("setTranslateBatchQueueConfig", (message) => {
    const { data } = message
    batchQueue.setBatchConfig(data)
  })

  onMessage("getTranslationCacheOverview", async (message) => {
    return await getTranslationCacheOverview(message.data.rangeKey)
  })

  onMessage("inspectTranslationCacheLayer", async (message) => {
    return await getTranslationCacheInspection(message.data.layer, message.data.limit)
  })
}

/**
 * Set up subtitles translation queue and message handlers
 */
export async function setUpSubtitlesTranslationQueue() {
  const config = await ensureInitializedConfig()
  const { videoSubtitles: { requestQueueConfig, batchQueueConfig } } = config ?? DEFAULT_CONFIG

  const { requestQueue, batchQueue } = await createTranslationQueues({
    requestQueueConfig,
    batchQueueConfig,
    promptResolver: getSubtitlesTranslatePrompt,
  })

  onMessage("enqueueSubtitlesTranslateRequest", async (message) => {
    const { data: { text, glossaryPrompt, langConfig, providerConfig, scheduleAt, hash, stableCacheKey, videoTitle, subtitlesContext } } = message

    const exactCached = await getCachedTranslation(hash)
    if (exactCached) {
      return exactCached
    }

    const stableCached = await getCachedStableTranslation(stableCacheKey)
    if (stableCached) {
      setExactTranslationCache(hash, stableCached.translation)
      return stableCached
    }

    enqueueCacheAccessEvent("miss")

    let result = ""
    const content: ArticleContent = {
      title: videoTitle || "",
    }

    if (isLLMProviderConfig(providerConfig)) {
      const runtimeConfig = await ensureInitializedConfig()
      if (runtimeConfig?.translate.enableAIContentAware && videoTitle && subtitlesContext) {
        content.summary = await getOrGenerateSummary(videoTitle, subtitlesContext, providerConfig, requestQueue)
      }

      const data = { text, glossaryPrompt, langConfig, providerConfig, hash, scheduleAt, content }
      result = await batchQueue.enqueue(data)
    }
    else {
      const thunk = () => executeTranslate(text, langConfig, providerConfig, getSubtitlesTranslatePrompt, { glossaryPrompt, runInBackground: true })
      result = await requestQueue.enqueue(thunk, scheduleAt, hash)
    }

    persistTranslationResult(hash, stableCacheKey, result)

    return createTranslationResult(result)
  })

  onMessage("setSubtitlesRequestQueueConfig", (message) => {
    const { data } = message
    requestQueue.setQueueOptions(data)
  })

  onMessage("setSubtitlesBatchQueueConfig", (message) => {
    const { data } = message
    batchQueue.setBatchConfig(data)
  })
}
