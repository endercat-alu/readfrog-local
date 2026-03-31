import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { CONFIG_SCHEMA_VERSION } from "@/utils/constants/config"
import { ConfigVersionTooNewError } from "../errors"
import { migrateConfig } from "../migration"

describe("migrateConfig", () => {
  it("should throw ConfigVersionTooNewError when schema version is newer than current", async () => {
    const futureVersion = CONFIG_SCHEMA_VERSION + 1
    const config = {}

    await expect(migrateConfig(config, futureVersion))
      .rejects
      .toThrow(ConfigVersionTooNewError)
  })

  it("should normalize legacy page rule fields for schema v67 imports", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      translate: {
        ...DEFAULT_CONFIG.translate,
        page: {
          ...DEFAULT_CONFIG.translate.page,
          rules: [],
          autoTranslatePatterns: ["example.com"],
          autoTranslateLanguages: ["jpn"],
          skipLanguages: ["cmn"],
          enableLLMDetection: false,
          enableSkipLanguagesLLMDetection: false,
          minCharactersPerNode: 10,
          minWordsPerNode: 5,
          nodeIgnoreHeuristics: {
            rulesetVersion: 3,
            enabledRules: ["semanticTags", "numericLike"],
          },
        },
      },
    }

    const migrated = await migrateConfig(config, CONFIG_SCHEMA_VERSION)
    const fields = migrated.translate.page.rules.flatMap((rule) => {
      const collect = (node: any): string[] => node.kind === "condition" ? [node.field] : node.items.flatMap(collect)
      return collect(rule.when)
    })

    expect(fields).toContain("host")
    expect(fields).toContain("pageLanguage")
    expect(fields).toContain("paragraphLanguage")
    expect(fields).toContain("textLengthLessThan")
    expect(fields).toContain("wordCountLessThan")
    expect(fields).toContain("heuristic")
  })
})
