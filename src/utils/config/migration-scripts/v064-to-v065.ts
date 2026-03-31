import { DEFAULT_CONFIG } from "@/utils/constants/config"

/**
 * Migration script from v064 to v065
 * - Adds configurable short text stable cache switch for translation
 */
export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    translate: {
      ...oldConfig.translate,
      enableShortTextCache: oldConfig.translate?.enableShortTextCache ?? DEFAULT_CONFIG.translate.enableShortTextCache,
    },
  }
}
