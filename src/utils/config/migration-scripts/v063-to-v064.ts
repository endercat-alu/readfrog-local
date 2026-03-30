import { DEFAULT_CONFIG } from "@/utils/constants/config"

/**
 * Migration script from v063 to v064
 * - Adds configurable node ignore heuristics for page translation
 */
export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    translate: {
      ...oldConfig.translate,
      page: {
        ...oldConfig.translate?.page,
        nodeIgnoreHeuristics: {
          ...DEFAULT_CONFIG.translate.page.nodeIgnoreHeuristics,
          ...oldConfig.translate?.page?.nodeIgnoreHeuristics,
        },
      },
    },
  }
}
