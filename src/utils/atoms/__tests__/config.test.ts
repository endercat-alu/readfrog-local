import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { mergeWithArrayOverwrite } from "../config"

describe("mergeWithArrayOverwrite", () => {
  it("should overwrite arrays and merge objects in complex config scenarios", () => {
    const config = {
      language: DEFAULT_CONFIG.language,
      translate: {
        ...DEFAULT_CONFIG.translate,
        page: {
          ...DEFAULT_CONFIG.translate.page,
          rules: [
            {
              id: "rule-old",
              name: "Old rule",
              enabled: true,
              when: {
                kind: "group",
                id: "group-old",
                operator: "and",
                items: [
                  { kind: "condition", id: "condition-old", field: "host", value: "old.com" },
                ],
              },
              action: {
                type: "translate",
                scope: "page",
              },
            },
          ],
        },
      },
      floatingButton: {
        ...DEFAULT_CONFIG.floatingButton,
        disabledFloatingButtonPatterns: ["gmail.com"],
      },
    }

    const patch = {
      language: { targetCode: "jpn" },
      translate: {
        page: {
          rules: [
            {
              id: "rule-new",
              name: "New rule",
              enabled: true,
              when: {
                kind: "group",
                id: "group-new",
                operator: "and",
                items: [
                  { kind: "condition", id: "condition-new", field: "host", value: "new.com" },
                ],
              },
              action: {
                type: "translate",
                scope: "page",
              },
            },
          ],
        },
        mode: "translationOnly",
      },
      floatingButton: {
        disabledFloatingButtonPatterns: ["youtube.com"],
      },
    }

    const result = mergeWithArrayOverwrite(config, patch)

    expect(result.translate.page.rules).toEqual(patch.translate.page.rules)
    expect(result.floatingButton.disabledFloatingButtonPatterns).toEqual(["youtube.com"])
    expect(result.translate.mode).toBe("translationOnly")
    expect(result.floatingButton.enabled).toBe(true)
    expect(result).not.toBe(config)
    expect(result.translate.page.rules).not.toBe(config.translate.page.rules)
  })

  it("should handle edge cases and type conversions", () => {
    expect(mergeWithArrayOverwrite({ arr: [1, 2] }, { arr: "string" })).toEqual({ arr: "string" })
    expect(mergeWithArrayOverwrite({ val: "text" }, { val: ["a", "b"] })).toEqual({ val: ["a", "b"] })
    expect(mergeWithArrayOverwrite({ items: ["x"] }, { items: [] })).toEqual({ items: [] })
    expect(mergeWithArrayOverwrite({ a: null }, { a: 1, b: undefined })).toEqual({ a: 1, b: undefined })
  })
})
