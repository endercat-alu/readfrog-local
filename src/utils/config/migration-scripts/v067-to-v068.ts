import { DEFAULT_CONFIG } from "@/utils/constants/config"

export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    translate: {
      ...oldConfig.translate,
      page: {
        ...oldConfig.translate?.page,
        fastTranslation: {
          ...DEFAULT_CONFIG.translate.page.fastTranslation,
          ...oldConfig.translate?.page?.fastTranslation,
        },
      },
    },
  }
}
