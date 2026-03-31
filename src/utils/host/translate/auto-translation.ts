import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { Config } from "@/types/config/config"
import { getPageRuleAction } from "./page-rules"

export async function shouldEnableAutoTranslation(url: string, detectedCodeOrUnd: LangCodeISO6393 | "und", config: Config): Promise<boolean> {
  return (await getPageRuleAction(url, detectedCodeOrUnd, config)) === "translate"
}
