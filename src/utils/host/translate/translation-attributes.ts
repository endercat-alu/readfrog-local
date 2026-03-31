import type { Config } from "@/types/config/config"
import { getLanguageDirectionAndLang } from "@/utils/content/language-direction"

export function setTranslationDirAndLang(element: HTMLElement, config: Config): void {
  const { dir } = getLanguageDirectionAndLang(config.language.targetCode)
  element.style.unicodeBidi = "plaintext"

  if (dir === "rtl") {
    element.style.direction = dir
  }
  else {
    element.style.removeProperty("direction")
  }
}
