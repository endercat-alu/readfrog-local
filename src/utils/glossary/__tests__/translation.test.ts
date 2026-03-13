import { describe, expect, it } from "vitest"
import { DEFAULT_PROVIDER_CONFIG } from "@/utils/constants/providers"
import { formatGlossaryPrompt, prepareGlossaryTranslation } from "../translation"

describe("glossary translation", () => {
  it("should inject matched glossary items for llm translation", () => {
    const result = prepareGlossaryTranslation(
      "OpenAI built GPT-5 for ACME.",
      DEFAULT_PROVIDER_CONFIG.openai,
      [
        {
          id: "1",
          term: "ACME",
          translation: "艾克米",
          description: "A fictional company",
          llmOnly: false,
        },
        {
          id: "2",
          term: "OpenAI",
          translation: "OpenAI",
          description: "The model provider",
          llmOnly: true,
        },
      ],
    )

    expect(result.text).toBe("OpenAI built GPT-5 for ACME.")
    expect(result.glossaryPrompt).toBe(formatGlossaryPrompt([
      {
        term: "ACME",
        translation: "艾克米",
        description: "A fictional company",
      },
      {
        term: "OpenAI",
        translation: "OpenAI",
        description: "The model provider",
      },
    ]))
  })

  it("should replace only non-llm-only entries for machine translation", () => {
    const result = prepareGlossaryTranslation(
      "OpenAI works with ACME.",
      DEFAULT_PROVIDER_CONFIG["microsoft-translate"],
      [
        {
          id: "1",
          term: "ACME",
          translation: "艾克米",
          description: "",
          llmOnly: false,
        },
        {
          id: "2",
          term: "OpenAI",
          translation: "开放人工智能",
          description: "",
          llmOnly: true,
        },
      ],
    )

    expect(result.text).toBe("OpenAI works with 艾克米.")
    expect(result.glossaryPrompt).toBe("")
  })

  it("should respect word boundaries for ascii terms", () => {
    const result = prepareGlossaryTranslation(
      "This is paid AI work.",
      DEFAULT_PROVIDER_CONFIG["microsoft-translate"],
      [
        {
          id: "1",
          term: "AI",
          translation: "人工智能",
          description: "",
          llmOnly: false,
        },
      ],
    )

    expect(result.text).toBe("This is paid 人工智能 work.")
  })
})
