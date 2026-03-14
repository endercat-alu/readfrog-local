import { onMessage } from "@/utils/message"
import { performKagiTranslate } from "@/utils/host/translate/api/kagi"

export function setupKagiTranslateMessageHandlers() {
  onMessage("kagiTranslate", async (message) => {
    const { sourceText, fromLang, toLang, providerConfig, options } = message.data
    if (providerConfig.provider !== "kagi") {
      throw new Error("Invalid provider for Kagi translation")
    }

    try {
      return await performKagiTranslate(sourceText, fromLang, toLang, providerConfig, options)
    }
    catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }
  })
}
