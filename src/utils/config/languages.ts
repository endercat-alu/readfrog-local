import type { LangCodeISO6393 } from "@read-frog/definitions"
import { storage } from "#imports"
import { DEFAULT_DETECTED_CODE, DETECTED_CODE_STORAGE_KEY } from "../constants/config"

export function getFinalSourceCode(sourceCode: LangCodeISO6393 | "auto", detectedCode: LangCodeISO6393): LangCodeISO6393 {
  return sourceCode === "auto" ? detectedCode : sourceCode
}

let detectedCodeCacheState: {
  url: string
  value: LangCodeISO6393 | null
  pending: Promise<LangCodeISO6393> | null
} | null = null

export async function getDetectedCodeFromStorage(): Promise<LangCodeISO6393> {
  if (typeof window === "undefined") {
    return await storage.getItem<LangCodeISO6393>(`local:${DETECTED_CODE_STORAGE_KEY}`) ?? DEFAULT_DETECTED_CODE
  }

  if (!detectedCodeCacheState || detectedCodeCacheState.url !== window.location.href) {
    detectedCodeCacheState = {
      url: window.location.href,
      value: null,
      pending: null,
    }
  }

  if (detectedCodeCacheState.value) {
    return detectedCodeCacheState.value
  }

  if (detectedCodeCacheState.pending) {
    return detectedCodeCacheState.pending
  }

  detectedCodeCacheState.pending = storage
    .getItem<LangCodeISO6393>(`local:${DETECTED_CODE_STORAGE_KEY}`)
    .then((value) => {
      const resolvedValue = value ?? DEFAULT_DETECTED_CODE
      if (detectedCodeCacheState?.url === window.location.href) {
        detectedCodeCacheState.value = resolvedValue
      }
      return resolvedValue
    })
    .finally(() => {
      if (detectedCodeCacheState?.url === window.location.href) {
        detectedCodeCacheState.pending = null
      }
    })

  return detectedCodeCacheState.pending
}
