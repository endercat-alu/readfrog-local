import type { EntityTable } from "dexie"
import { upperCamelCase } from "case-anything"
import Dexie from "dexie"
import { APP_NAME } from "@/utils/constants/app"
import AiSegmentationCache from "./tables/ai-segmentation-cache"
import CacheAccessBucket from "./tables/cache-access-bucket"
import ArticleSummaryCache from "./tables/article-summary-cache"
import BatchRequestRecord from "./tables/batch-request-record"
import CacheAccessRecord from "./tables/cache-access-record"
import TranslationCache from "./tables/translation-cache"

export default class AppDB extends Dexie {
  translationCache!: EntityTable<
    TranslationCache,
    "key"
  >

  stableTranslationCache!: EntityTable<
    TranslationCache,
    "key"
  >

  batchRequestRecord!: EntityTable<
    BatchRequestRecord,
    "key"
  >

  cacheAccessRecord!: EntityTable<
    CacheAccessRecord,
    "key"
  >

  cacheAccessBucket!: EntityTable<
    CacheAccessBucket,
    "key"
  >

  articleSummaryCache!: EntityTable<
    ArticleSummaryCache,
    "key"
  >

  aiSegmentationCache!: EntityTable<
    AiSegmentationCache,
    "key"
  >

  constructor() {
    super(`${upperCamelCase(APP_NAME)}DB`)
    this.version(1).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
    })
    this.version(2).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
    })
    this.version(3).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
    })
    this.version(4).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
    })
    this.version(5).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      stableTranslationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
    })
    this.version(6).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      stableTranslationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      cacheAccessRecord: `
        key,
        createdAt,
        eventType`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
    })
    this.version(7).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      stableTranslationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      cacheAccessRecord: `
        key,
        createdAt,
        eventType`,
      cacheAccessBucket: `
        key,
        bucketStart`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
    })
    this.translationCache.mapToClass(TranslationCache)
    this.stableTranslationCache.mapToClass(TranslationCache)
    this.batchRequestRecord.mapToClass(BatchRequestRecord)
    this.cacheAccessRecord.mapToClass(CacheAccessRecord)
    this.cacheAccessBucket.mapToClass(CacheAccessBucket)
    this.articleSummaryCache.mapToClass(ArticleSummaryCache)
    this.aiSegmentationCache.mapToClass(AiSegmentationCache)
  }
}
