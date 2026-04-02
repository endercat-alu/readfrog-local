import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { translateTextForPage, translateTextForPageWithResult } from "@/utils/host/translate/translate-variants"
import { getTranslatePrompt } from "@/utils/prompts/translate"

// Mock dependencies
vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: vi.fn(),
}))

vi.mock("@/utils/message", () => ({
  sendMessage: vi.fn(),
}))

vi.mock("@/utils/host/translate/api/microsoft", () => ({
  microsoftTranslate: vi.fn(),
}))

vi.mock("@/utils/prompts/translate", () => ({
  getTranslatePrompt: vi.fn(),
}))

vi.mock("@/utils/config/languages", () => ({
  getDetectedCodeFromStorage: vi.fn(),
  getFinalSourceCode: (sourceCode: string, detectedCode: string) => sourceCode === "auto" ? detectedCode : sourceCode,
}))

let mockSendMessage: any
let mockMicrosoftTranslate: any
let mockGetConfigFromStorage: any
let mockGetTranslatePrompt: any
let mockGetDetectedCodeFromStorage: any

describe("translate-text", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockSendMessage = vi.mocked((await import("@/utils/message")).sendMessage)
    mockMicrosoftTranslate = vi.mocked((await import("@/utils/host/translate/api/microsoft")).microsoftTranslate)
    mockGetConfigFromStorage = vi.mocked((await import("@/utils/config/storage")).getLocalConfig)
    mockGetTranslatePrompt = vi.mocked((await import("@/utils/prompts/translate")).getTranslatePrompt)
    mockGetDetectedCodeFromStorage = vi.mocked((await import("@/utils/config/languages")).getDetectedCodeFromStorage)

    // Mock getConfigFromStorage to return DEFAULT_CONFIG
    mockGetConfigFromStorage.mockResolvedValue(DEFAULT_CONFIG)
    mockGetDetectedCodeFromStorage.mockResolvedValue("eng")

    // Mock getTranslatePrompt to return a simple prompt
    mockGetTranslatePrompt.mockResolvedValue("Translate to {{targetLang}}: {{input}}")
  })

  describe("translateTextForPage", () => {
    it("should send message with correct parameters", async () => {
      mockSendMessage.mockResolvedValue({ translation: "translated text" })

      const result = await translateTextForPage("test text")

      expect(result).toBe("translated text")
      expect(mockSendMessage).toHaveBeenCalledWith("enqueueTranslateRequest", expect.objectContaining({
        text: "test text",
        langConfig: DEFAULT_CONFIG.language,
        providerConfig: expect.any(Object),
        scheduleAt: expect.any(Number),
        hash: expect.any(String),
      }))
    })

    it("should attach stableCacheKey for eligible short text when enabled", async () => {
      mockSendMessage.mockResolvedValue({ translation: "translated text" })

      await translateTextForPage("Download")

      expect(mockSendMessage).toHaveBeenCalledWith("enqueueTranslateRequest", expect.objectContaining({
        text: "Download",
        stableCacheKey: expect.any(String),
      }))
    })

    it("should not attach stableCacheKey for long text", async () => {
      mockSendMessage.mockResolvedValue({ translation: "translated text" })

      await translateTextForPage("This is a much longer paragraph-like sentence that should not use the short text stable cache.")

      expect(mockSendMessage).toHaveBeenCalledWith("enqueueTranslateRequest", expect.objectContaining({
        stableCacheKey: undefined,
      }))
    })

    it("should not attach stableCacheKey when disabled by config", async () => {
      mockSendMessage.mockResolvedValue({ translation: "translated text" })
      mockGetConfigFromStorage.mockResolvedValue({
        ...DEFAULT_CONFIG,
        translate: {
          ...DEFAULT_CONFIG.translate,
          enableShortTextCache: false,
        },
      })

      await translateTextForPage("Download")

      expect(mockSendMessage).toHaveBeenCalledWith("enqueueTranslateRequest", expect.objectContaining({
        text: "Download",
        stableCacheKey: undefined,
      }))
    })

    it("should not request two translations when fast provider matches default provider", async () => {
      mockSendMessage.mockResolvedValue({ translation: "translated text" })

      const result = await translateTextForPageWithResult("test text")

      expect(result.translation).toBe("translated text")
      expect(mockSendMessage).toHaveBeenCalledTimes(1)
    })

    it("should show fast provider result first and overwrite with default provider result", async () => {
      let resolveDefault!: (value: { translation: string }) => void
      let resolveFast!: (value: { translation: string }) => void

      mockGetConfigFromStorage.mockResolvedValue({
        ...DEFAULT_CONFIG,
        translate: {
          ...DEFAULT_CONFIG.translate,
          providerId: "openai-default",
          page: {
            ...DEFAULT_CONFIG.translate.page,
            fastTranslation: {
              enabled: true,
              providerId: "microsoft-translate-default",
              overwriteWithDefaultProvider: true,
            },
          },
        },
      })

      mockSendMessage.mockImplementation((_type: string, payload: { providerConfig: { id: string } }) => {
        if (payload.providerConfig.id === "openai-default") {
          return new Promise((resolve) => {
            resolveDefault = resolve
          })
        }

        return new Promise((resolve) => {
          resolveFast = resolve
        })
      })

      const updates: Array<{ translation: string, isFinal: boolean, source: "default" | "fast" }> = []
      const resultPromise = translateTextForPageWithResult("test text", {
        onUpdate: (result, meta) => {
          updates.push({
            translation: result.translation,
            isFinal: meta.isFinal,
            source: meta.source,
          })
        },
      })

      await vi.waitFor(() => {
        expect(resolveFast).toBeTypeOf("function")
      })
      resolveFast({ translation: "fast text" })
      await vi.waitFor(() => {
        expect(updates).toEqual([
          { translation: "fast text", isFinal: false, source: "fast" },
        ])
      })

      resolveDefault({ translation: "default text" })
      const result = await resultPromise

      expect(result.translation).toBe("default text")
      expect(updates).toEqual([
        { translation: "fast text", isFinal: false, source: "fast" },
        { translation: "default text", isFinal: true, source: "default" },
      ])
    })

    it("should return fast provider result immediately when overwrite is disabled", async () => {
      let resolveDefault!: (value: { translation: string }) => void
      let resolveFast!: (value: { translation: string }) => void

      mockGetConfigFromStorage.mockResolvedValue({
        ...DEFAULT_CONFIG,
        translate: {
          ...DEFAULT_CONFIG.translate,
          providerId: "openai-default",
          page: {
            ...DEFAULT_CONFIG.translate.page,
            fastTranslation: {
              enabled: true,
              providerId: "microsoft-translate-default",
              overwriteWithDefaultProvider: false,
            },
          },
        },
      })

      mockSendMessage.mockImplementation((_type: string, payload: { providerConfig: { id: string } }) => {
        if (payload.providerConfig.id === "openai-default") {
          return new Promise((resolve) => {
            resolveDefault = resolve
          })
        }

        return new Promise((resolve) => {
          resolveFast = resolve
        })
      })

      const updates: Array<{ translation: string, isFinal: boolean, source: "default" | "fast" }> = []
      const resultPromise = translateTextForPageWithResult("test text", {
        onUpdate: (result, meta) => {
          updates.push({
            translation: result.translation,
            isFinal: meta.isFinal,
            source: meta.source,
          })
        },
      })

      await vi.waitFor(() => {
        expect(resolveFast).toBeTypeOf("function")
      })
      resolveFast({ translation: "fast text" })
      const result = await resultPromise

      expect(result.translation).toBe("fast text")
      expect(updates).toEqual([
        { translation: "fast text", isFinal: true, source: "fast" },
      ])

      resolveDefault({ translation: "default text" })
    })
  })

  describe("executeTranslate", () => {
    const langConfig = {
      sourceCode: "eng" as const,
      targetCode: "cmn" as const,
      detectedCode: "eng" as const,
      level: "intermediate" as const,
    }

    const providerConfig = {
      id: "microsoft-default",
      enabled: true,
      name: "Microsoft Translator",
      provider: "microsoft-translate" as const,
    }

    it("should return empty string for empty/whitespace input", async () => {
      expect(await executeTranslate("", langConfig, providerConfig, getTranslatePrompt)).toBe("")
      expect(await executeTranslate(" ", langConfig, providerConfig, getTranslatePrompt)).toBe("")
      expect(await executeTranslate("\n", langConfig, providerConfig, getTranslatePrompt)).toBe("")
      expect(await executeTranslate(" \n ", langConfig, providerConfig, getTranslatePrompt)).toBe("")
      expect(await executeTranslate(" \n \t", langConfig, providerConfig, getTranslatePrompt)).toBe("")
    })

    it("should handle zero-width spaces correctly", async () => {
      // Only zero-width spaces should return empty
      expect(await executeTranslate("\u200B\u200B", langConfig, providerConfig, getTranslatePrompt)).toBe("")

      // Mixed invisible + whitespace should return empty
      expect(await executeTranslate("\u200B \u200B", langConfig, providerConfig, getTranslatePrompt)).toBe("")

      // Should translate valid content after removing zero-width spaces
      mockMicrosoftTranslate.mockResolvedValue("你好")
      const result = await executeTranslate("\u200B hello \u200B", langConfig, providerConfig, getTranslatePrompt)
      expect(result).toBe("你好")
      // Microsoft translate should receive the original text
      expect(mockMicrosoftTranslate).toHaveBeenCalledWith("\u200B hello \u200B", "en", "zh")
    })

    it("should trim translation result", async () => {
      mockMicrosoftTranslate.mockResolvedValue("  测试结果  ")

      const result = await executeTranslate("test input", langConfig, providerConfig, getTranslatePrompt)

      expect(result).toBe("测试结果")
    })

    it("should route Kagi translation through background messaging", async () => {
      mockSendMessage.mockResolvedValue("  你好，Kagi  ")

      const result = await executeTranslate("hello", langConfig, {
        id: "kagi-default",
        enabled: true,
        name: "Kagi Translate",
        provider: "kagi",
        baseURL: "https://translate.kagi.com",
      }, getTranslatePrompt)

      expect(result).toBe("你好，Kagi")
      expect(mockSendMessage).toHaveBeenCalledWith("kagiTranslate", expect.objectContaining({
        sourceText: "hello",
        fromLang: "en",
        toLang: "zh",
      }))
    })
  })
})
