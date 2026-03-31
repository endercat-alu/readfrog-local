import { beforeEach, describe, expect, it, vi } from "vitest"

const alarmsGetMock = vi.fn()
const alarmsCreateMock = vi.fn()
const alarmsAddListenerMock = vi.fn()

const translationBelowToArrayMock = vi.fn()
const translationWhereMock = vi.fn()
const translationBulkDeleteMock = vi.fn()
const translationOrderByToArrayMock = vi.fn()
const translationOrderByLimitMock = vi.fn()
const translationOrderByMock = vi.fn()
const translationCountMock = vi.fn()

const stableTranslationBelowToArrayMock = vi.fn()
const stableTranslationWhereMock = vi.fn()
const stableTranslationBulkDeleteMock = vi.fn()
const stableTranslationOrderByToArrayMock = vi.fn()
const stableTranslationOrderByLimitMock = vi.fn()
const stableTranslationOrderByMock = vi.fn()
const stableTranslationAnyOfToArrayMock = vi.fn()
const stableTranslationCountMock = vi.fn()

const cacheAccessBucketDeleteMock = vi.fn()
const cacheAccessBucketWhereMock = vi.fn()
const cacheAccessDeleteMock = vi.fn()
const cacheAccessWhereMock = vi.fn()

const requestCountMock = vi.fn()
const requestOrderByToArrayMock = vi.fn()
const requestOrderByLimitMock = vi.fn()
const requestOrderByMock = vi.fn()
const requestBulkDeleteMock = vi.fn()
const requestDeleteByAgeMock = vi.fn()
const requestWhereMock = vi.fn()

const summaryDeleteMock = vi.fn()
const summaryWhereMock = vi.fn()

const loggerInfoMock = vi.fn()
const loggerErrorMock = vi.fn()
const flushPendingTranslationCacheStateMock = vi.fn()

vi.mock("#imports", () => ({
  browser: {
    alarms: {
      get: alarmsGetMock,
      create: alarmsCreateMock,
      onAlarm: {
        addListener: alarmsAddListenerMock,
      },
    },
  },
}))

vi.mock("wxt/browser", () => ({
  browser: {
    alarms: {
      get: alarmsGetMock,
      create: alarmsCreateMock,
      onAlarm: {
        addListener: alarmsAddListenerMock,
      },
    },
  },
}))

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    translationCache: {
      where: translationWhereMock,
      bulkDelete: translationBulkDeleteMock,
      orderBy: translationOrderByMock,
      count: translationCountMock,
      clear: vi.fn(),
    },
    stableTranslationCache: {
      where: stableTranslationWhereMock,
      bulkDelete: stableTranslationBulkDeleteMock,
      orderBy: stableTranslationOrderByMock,
      count: stableTranslationCountMock,
      clear: vi.fn(),
    },
    cacheAccessRecord: {
      where: cacheAccessWhereMock,
      clear: vi.fn(),
    },
    cacheAccessBucket: {
      where: cacheAccessBucketWhereMock,
      clear: vi.fn(),
    },
    batchRequestRecord: {
      count: requestCountMock,
      orderBy: requestOrderByMock,
      bulkDelete: requestBulkDeleteMock,
      where: requestWhereMock,
      clear: vi.fn(),
    },
    articleSummaryCache: {
      where: summaryWhereMock,
      clear: vi.fn(),
    },
    aiSegmentationCache: {
      clear: vi.fn(),
    },
  },
}))

vi.mock("../translation-queues", () => ({
  flushPendingTranslationCacheState: flushPendingTranslationCacheStateMock,
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}))

describe("setUpDatabaseCleanup", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    alarmsGetMock.mockResolvedValue(null)
    alarmsCreateMock.mockResolvedValue(undefined)
    flushPendingTranslationCacheStateMock.mockResolvedValue(undefined)

    translationBelowToArrayMock.mockResolvedValue([])
    translationBulkDeleteMock.mockResolvedValue(undefined)
    translationOrderByToArrayMock.mockResolvedValue([])
    translationOrderByLimitMock.mockReturnValue({
      toArray: translationOrderByToArrayMock,
    })
    translationOrderByMock.mockReturnValue({
      limit: translationOrderByLimitMock,
    })

    stableTranslationBelowToArrayMock.mockResolvedValue([])
    stableTranslationBulkDeleteMock.mockResolvedValue(undefined)
    stableTranslationOrderByToArrayMock.mockResolvedValue([])
    stableTranslationOrderByLimitMock.mockReturnValue({
      toArray: stableTranslationOrderByToArrayMock,
    })
    stableTranslationOrderByMock.mockReturnValue({
      limit: stableTranslationOrderByLimitMock,
    })
    stableTranslationAnyOfToArrayMock.mockResolvedValue([])
    translationCountMock.mockResolvedValue(0)
    stableTranslationCountMock.mockResolvedValue(0)
    translationWhereMock.mockImplementation((indexName: string) => ({
      below: () => ({
        toArray: translationBelowToArrayMock,
      }),
    }))
    stableTranslationWhereMock.mockImplementation((indexName: string) => {
      if (indexName === "exactKey") {
        return {
          anyOf: () => ({
            toArray: stableTranslationAnyOfToArrayMock,
          }),
        }
      }

      return {
        below: () => ({
          toArray: stableTranslationBelowToArrayMock,
        }),
      }
    })
    cacheAccessBucketDeleteMock.mockResolvedValue(0)
    cacheAccessBucketWhereMock.mockReturnValue({
      below: () => ({
        delete: cacheAccessBucketDeleteMock,
      }),
    })
    cacheAccessDeleteMock.mockResolvedValue(0)
    cacheAccessWhereMock.mockReturnValue({
      below: () => ({
        delete: cacheAccessDeleteMock,
      }),
    })

    requestCountMock.mockResolvedValue(0)
    requestOrderByToArrayMock.mockResolvedValue([])
    requestOrderByLimitMock.mockReturnValue({
      toArray: requestOrderByToArrayMock,
    })
    requestOrderByMock.mockReturnValue({
      limit: requestOrderByLimitMock,
    })
    requestBulkDeleteMock.mockResolvedValue(undefined)
    requestDeleteByAgeMock.mockResolvedValue(0)
    requestWhereMock.mockReturnValue({
      below: () => ({
        delete: requestDeleteByAgeMock,
      }),
    })

    summaryDeleteMock.mockResolvedValue(0)
    summaryWhereMock.mockReturnValue({
      below: () => ({
        delete: summaryDeleteMock,
      }),
    })
  })

  it("does not run cleanup immediately on setup", async () => {
    const { setUpDatabaseCleanup } = await import("../db-cleanup")
    await setUpDatabaseCleanup()

    expect(alarmsCreateMock).toHaveBeenCalledTimes(3)
    expect(alarmsAddListenerMock).toHaveBeenCalledTimes(1)

    expect(translationWhereMock).not.toHaveBeenCalled()
    expect(requestCountMock).not.toHaveBeenCalled()
    expect(summaryWhereMock).not.toHaveBeenCalled()
  })

  it("does not recreate alarms when they already exist", async () => {
    alarmsGetMock
      .mockResolvedValueOnce({ name: "cache-cleanup" })
      .mockResolvedValueOnce({ name: "request-record-cleanup" })
      .mockResolvedValueOnce({ name: "summary-cache-cleanup" })

    const { setUpDatabaseCleanup } = await import("../db-cleanup")
    await setUpDatabaseCleanup()

    expect(alarmsCreateMock).not.toHaveBeenCalled()
  })

  it("runs only the matching cleanup handler for each alarm", async () => {
    let alarmListener: ((alarm: { name: string }) => Promise<void>) | undefined
    alarmsAddListenerMock.mockImplementation((listener: (alarm: { name: string }) => Promise<void>) => {
      alarmListener = listener
    })

    const {
      setUpDatabaseCleanup,
      REQUEST_RECORD_CLEANUP_ALARM,
      SUMMARY_CACHE_CLEANUP_ALARM,
      TRANSLATION_CACHE_CLEANUP_ALARM,
    } = await import("../db-cleanup")

    await setUpDatabaseCleanup()
    if (!alarmListener) {
      throw new Error("Alarm listener was not registered")
    }

    await alarmListener({ name: TRANSLATION_CACHE_CLEANUP_ALARM })
    expect(translationWhereMock).toHaveBeenCalledTimes(1)
    expect(stableTranslationWhereMock).toHaveBeenCalledTimes(1)
    expect(cacheAccessBucketWhereMock).toHaveBeenCalledTimes(1)
    expect(cacheAccessWhereMock).toHaveBeenCalledTimes(1)
    expect(requestCountMock).not.toHaveBeenCalled()
    expect(summaryWhereMock).not.toHaveBeenCalled()

    await alarmListener({ name: REQUEST_RECORD_CLEANUP_ALARM })
    expect(requestCountMock).toHaveBeenCalledTimes(1)
    expect(summaryWhereMock).not.toHaveBeenCalled()

    await alarmListener({ name: SUMMARY_CACHE_CLEANUP_ALARM })
    expect(summaryWhereMock).toHaveBeenCalledTimes(1)
  })
})
