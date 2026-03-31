import { DEFAULT_NODE_IGNORE_HEURISTIC_RULES } from "@/utils/constants/config"

function createGroup(id: string, items: any[], operator: "and" | "or" = "and") {
  return {
    kind: "group",
    id,
    operator,
    items,
  }
}

function createCondition(id: string, field: "host" | "pageLanguage" | "paragraphLanguage", value: string, extra?: Record<string, unknown>) {
  return {
    kind: "condition",
    id,
    field,
    value,
    ...extra,
  }
}

export function migrate(oldConfig: any): any {
  const oldPageConfig = oldConfig.translate?.page ?? {}
  const autoTranslatePatterns = Array.isArray(oldPageConfig.autoTranslatePatterns) ? oldPageConfig.autoTranslatePatterns : []
  const autoTranslateLanguages = Array.isArray(oldPageConfig.autoTranslateLanguages) ? oldPageConfig.autoTranslateLanguages : []
  const skipLanguages = Array.isArray(oldPageConfig.skipLanguages) ? oldPageConfig.skipLanguages : []
  const minCharactersPerNode = typeof oldPageConfig.minCharactersPerNode === "number" ? oldPageConfig.minCharactersPerNode : 0
  const minWordsPerNode = typeof oldPageConfig.minWordsPerNode === "number" ? oldPageConfig.minWordsPerNode : 0
  const shortTextConditions = []

  if (minCharactersPerNode > 0) {
    shortTextConditions.push({
      kind: "condition",
      id: "condition-skip-short-text-by-length",
      field: "textLengthLessThan",
      value: minCharactersPerNode,
    })
  }

  if (minWordsPerNode > 0) {
    shortTextConditions.push({
      kind: "condition",
      id: "condition-skip-short-text-by-words",
      field: "wordCountLessThan",
      value: minWordsPerNode,
    })
  }

  const rules = [
    {
      id: "rule-auto-translate-websites",
      name: "Auto translate websites",
      enabled: autoTranslatePatterns.length > 0,
      when: createGroup(
        "group-auto-translate-websites",
        autoTranslatePatterns.map((pattern: string, index: number) => createCondition(`condition-auto-translate-websites-${index}`, "host", pattern)),
        "or",
      ),
      action: {
        type: "translate",
        scope: "page",
      },
    },
    {
      id: "rule-auto-translate-languages",
      name: "Auto translate languages",
      enabled: autoTranslateLanguages.length > 0,
      when: createGroup(
        "group-auto-translate-languages",
        autoTranslateLanguages.map((language: string, index: number) => createCondition(`condition-auto-translate-languages-${index}`, "pageLanguage", language, {
          detectionMode: oldPageConfig.enableLLMDetection ? "llm" : "basic",
        })),
        "or",
      ),
      action: {
        type: "translate",
        scope: "page",
      },
    },
    {
      id: "rule-skip-paragraph-languages",
      name: "Skip paragraph languages",
      enabled: skipLanguages.length > 0,
      when: createGroup(
        "group-skip-paragraph-languages",
        skipLanguages.map((language: string, index: number) => createCondition(`condition-skip-paragraph-languages-${index}`, "paragraphLanguage", language, {
          detectionMode: oldPageConfig.enableSkipLanguagesLLMDetection ? "llm" : "basic",
        })),
        "or",
      ),
      action: {
        type: "skip",
        scope: "paragraph",
      },
    },
    {
      id: "rule-skip-short-text",
      name: "Skip short text",
      enabled: shortTextConditions.length > 0,
      when: createGroup(
        "group-skip-short-text",
        shortTextConditions,
        "or",
      ),
      action: {
        type: "skip",
        scope: "paragraph",
      },
    },
    {
      id: "rule-skip-heuristic-nodes",
      name: "Skip heuristic nodes",
      enabled: true,
      when: createGroup(
        "group-skip-heuristic-nodes",
        DEFAULT_NODE_IGNORE_HEURISTIC_RULES.map((rule: string, index: number) => ({
          kind: "condition",
          id: `condition-skip-heuristic-nodes-${index}`,
          field: "heuristic",
          value: rule,
        })),
        "or",
      ),
      action: {
        type: "skip",
        scope: "paragraph",
      },
    },
  ]

  const {
    autoTranslatePatterns: _autoTranslatePatterns,
    autoTranslateLanguages: _autoTranslateLanguages,
    enableLLMDetection: _enableLLMDetection,
    minCharactersPerNode: _minCharactersPerNode,
    minWordsPerNode: _minWordsPerNode,
    nodeIgnoreHeuristics: _nodeIgnoreHeuristics,
    skipLanguages: _skipLanguages,
    enableSkipLanguagesLLMDetection: _enableSkipLanguagesLLMDetection,
    ...restPageConfig
  } = oldPageConfig

  return {
    ...oldConfig,
    translate: {
      ...oldConfig.translate,
      page: {
        ...restPageConfig,
        rules,
      },
    },
  }
}
