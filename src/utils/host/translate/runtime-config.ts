import type { Config } from "@/types/config/config"

let runtimePageTranslationConfig: Config | null = null

export function getPageTranslationRuntimeConfig(): Config | null {
  return runtimePageTranslationConfig
}

export function setPageTranslationRuntimeConfig(config: Config | null): void {
  runtimePageTranslationConfig = config
}
