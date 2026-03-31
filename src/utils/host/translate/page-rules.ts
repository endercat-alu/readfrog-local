import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type { PageRule, PageRuleConditionField, PageRuleGroup, PageRuleNode } from "@/types/config/translate"
import type { TransNode } from "@/types/dom"
import { ISO6393_TO_6391 } from "@read-frog/definitions"
import { isLLMProviderConfig } from "@/types/config/provider"
import { getFinalSourceCode } from "@/utils/config/languages"
import { matchDomainPattern, matchWildcardPattern } from "@/utils/url"
import { matchesSemanticTagHeuristic, matchesTextHeuristicRule } from "./node-ignore-heuristics"
import { detectLanguageCached, MIN_LENGTH_FOR_SKIP_LLM_DETECTION } from "./translate-text"

type PageRuleStage = "page" | "paragraph"
type PartialMatchResult = boolean | null

interface BaseRuleContext {
  url: string
  pageLanguage: LangCodeISO6393 | null
}

interface ParagraphRuleContext extends BaseRuleContext {
  text: string
  nodes: readonly TransNode[]
  sourceLanguage: LangCodeISO6393
  getParagraphLanguage: () => Promise<LangCodeISO6393 | null>
  getWordCount: () => number
}

function matchesRuleStage(rule: PageRule, stage: PageRuleStage): boolean {
  return rule.enabled && rule.action.scope === stage
}

function isUrlLikeField(field: PageRuleConditionField): field is Extract<PageRuleConditionField, "host" | "path" | "url"> {
  return field === "host" || field === "path" || field === "url"
}

function getUrlObject(url: string): URL | null {
  try {
    return new URL(url)
  }
  catch {
    return null
  }
}

function evaluateUrlLikeCondition(url: string, field: Extract<PageRuleConditionField, "host" | "path" | "url">, value: string): boolean {
  if (field === "host") {
    return matchDomainPattern(url, value)
  }

  const urlObject = getUrlObject(url)
  if (!urlObject) {
    return false
  }

  if (field === "path") {
    return matchWildcardPattern(urlObject.pathname, value)
  }

  return matchWildcardPattern(urlObject.href, value)
}

function evaluatePartialUrlMatch(node: PageRuleNode, url: string): PartialMatchResult {
  if (node.kind === "condition") {
    if (!isUrlLikeField(node.field)) {
      return null
    }

    return evaluateUrlLikeCondition(url, node.field, node.value as string)
  }

  if (node.operator === "and") {
    let hasUnknown = false
    for (const item of node.items) {
      const result = evaluatePartialUrlMatch(item, url)
      if (result === false) {
        return false
      }
      if (result === null) {
        hasUnknown = true
      }
    }
    return hasUnknown ? null : true
  }

  let hasUnknown = false
  for (const item of node.items) {
    const result = evaluatePartialUrlMatch(item, url)
    if (result === true) {
      return true
    }
    if (result === null) {
      hasUnknown = true
    }
  }

  return hasUnknown ? null : false
}

async function evaluateRuleNode(
  node: PageRuleNode,
  context: BaseRuleContext | ParagraphRuleContext,
): Promise<boolean> {
  if (node.kind === "condition") {
    switch (node.field) {
      case "host":
      case "path":
      case "url":
        return evaluateUrlLikeCondition(context.url, node.field, node.value)
      case "pageLanguage":
        return context.pageLanguage === node.value
      case "paragraphLanguage":
        if (!("getParagraphLanguage" in context)) {
          return false
        }
        return (await context.getParagraphLanguage()) === node.value
      case "textLengthLessThan":
        if (!("text" in context)) {
          return false
        }
        return context.text.length < node.value
      case "wordCountLessThan":
        if (!("getWordCount" in context)) {
          return false
        }
        return context.getWordCount() < node.value
      case "heuristic":
        if (!("text" in context)) {
          return false
        }
        if (node.value === "semanticTags") {
          return false
        }
        return matchesTextHeuristicRule(node.value, context.nodes, context.text)
    }
  }

  if (node.operator === "and") {
    for (const item of node.items) {
      if (!await evaluateRuleNode(item, context)) {
        return false
      }
    }
    return true
  }

  for (const item of node.items) {
    if (await evaluateRuleNode(item, context)) {
      return true
    }
  }
  return false
}

function treeHasField(node: PageRuleNode, field: PageRuleConditionField): boolean {
  if (node.kind === "condition") {
    return node.field === field
  }

  return node.items.some(item => treeHasField(item, field))
}

function getResolvedPageLanguage(
  config: Config,
  detectedCodeOrUnd: LangCodeISO6393 | "und",
): LangCodeISO6393 | null {
  if (detectedCodeOrUnd === "und") {
    return null
  }

  return getFinalSourceCode(config.language.sourceCode, detectedCodeOrUnd)
}

export function shouldProcessAutoPageRulesForUrl(url: string, config: Config): boolean {
  const pageRules = config.translate.page.rules.filter(rule => matchesRuleStage(rule, "page"))
  return pageRules.some(rule => evaluatePartialUrlMatch(rule.when, url) !== false)
}

export function hasEnabledRuleField(
  rules: PageRule[],
  field: PageRuleConditionField,
  stage?: PageRuleStage,
): boolean {
  return rules.some(rule =>
    rule.enabled
    && (stage === undefined || rule.action.scope === stage)
    && treeHasField(rule.when, field),
  )
}

export function hasEnabledLLMDetectionRule(
  rules: PageRule[],
  field: Extract<PageRuleConditionField, "pageLanguage" | "paragraphLanguage">,
  stage?: PageRuleStage,
): boolean {
  return rules.some((rule) => {
    if (!rule.enabled || (stage !== undefined && rule.action.scope !== stage)) {
      return false
    }

    return hasLLMDetectionField(rule.when, field)
  })
}

function hasLLMDetectionField(node: PageRuleNode, field: Extract<PageRuleConditionField, "pageLanguage" | "paragraphLanguage">): boolean {
  if (node.kind === "condition") {
    return node.field === field && node.detectionMode === "llm"
  }

  return node.items.some(item => hasLLMDetectionField(item, field))
}

export async function getPageRuleAction(
  url: string,
  detectedCodeOrUnd: LangCodeISO6393 | "und",
  config: Config,
): Promise<"translate" | "skip" | null> {
  const pageLanguage = getResolvedPageLanguage(config, detectedCodeOrUnd)

  for (const rule of config.translate.page.rules) {
    if (!matchesRuleStage(rule, "page")) {
      continue
    }

    if (await evaluateRuleNode(rule.when, { url, pageLanguage })) {
      return rule.action.type
    }
  }

  return null
}

export async function shouldSkipParagraphTranslationByRules(
  text: string,
  url: string,
  config: Config,
  providerConfig: ProviderConfig,
  pageDetectedCode: LangCodeISO6393,
  nodes: readonly TransNode[] = [],
): Promise<boolean> {
  const paragraphRules = config.translate.page.rules.filter(rule =>
    matchesRuleStage(rule, "paragraph") && rule.action.type === "skip",
  )

  if (paragraphRules.length === 0) {
    return false
  }

  const pageLanguage = getResolvedPageLanguage(config, pageDetectedCode)
  const sourceLanguage = getFinalSourceCode(config.language.sourceCode, pageDetectedCode)
  let paragraphLanguagePromise: Promise<LangCodeISO6393 | null> | null = null
  let wordCount: number | null = null

  const getParagraphLanguage = async (): Promise<LangCodeISO6393 | null> => {
    if (!paragraphLanguagePromise) {
      paragraphLanguagePromise = detectLanguageCached(text, {
        minLength: MIN_LENGTH_FOR_SKIP_LLM_DETECTION,
        enableLLM: hasEnabledLLMDetectionRule(paragraphRules, "paragraphLanguage", "paragraph") && isLLMProviderConfig(providerConfig),
        providerConfig: isLLMProviderConfig(providerConfig) ? providerConfig : undefined,
      })
    }

    return paragraphLanguagePromise
  }

  const getWordCount = (): number => {
    if (wordCount !== null) {
      return wordCount
    }

    const locale = ISO6393_TO_6391[sourceLanguage] ?? "en"
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" })
    wordCount = [...segmenter.segment(text)].filter(segment => segment.isWordLike).length
    return wordCount
  }

  for (const rule of paragraphRules) {
    if (await evaluateRuleNode(rule.when, {
      url,
      pageLanguage,
      text,
      nodes,
      sourceLanguage,
      getParagraphLanguage,
      getWordCount,
    })) {
      return true
    }
  }

  return false
}

export function createRuleGroup(items: PageRuleNode[] = [], operator: PageRuleGroup["operator"] = "and"): PageRuleGroup {
  return {
    kind: "group",
    id: crypto.randomUUID(),
    operator,
    items,
  }
}

function evaluateSemanticRuleNode(node: PageRuleNode, url: string): PartialMatchResult {
  if (node.kind === "condition") {
    if (isUrlLikeField(node.field)) {
      return evaluateUrlLikeCondition(url, node.field, node.value as string)
    }

    if (node.field === "heuristic") {
      return node.value === "semanticTags"
    }

    return null
  }

  if (node.operator === "and") {
    let hasUnknown = false
    for (const item of node.items) {
      const result = evaluateSemanticRuleNode(item, url)
      if (result === false) {
        return false
      }
      if (result === null) {
        hasUnknown = true
      }
    }
    return hasUnknown ? null : true
  }

  let hasUnknown = false
  for (const item of node.items) {
    const result = evaluateSemanticRuleNode(item, url)
    if (result === true) {
      return true
    }
    if (result === null) {
      hasUnknown = true
    }
  }

  return hasUnknown ? null : false
}

export function shouldIgnoreElementByRules(
  element: HTMLElement,
  url: string,
  config: Config,
): boolean {
  if (!matchesSemanticTagHeuristic(element)) {
    return false
  }

  return config.translate.page.rules.some(rule =>
    matchesRuleStage(rule, "paragraph")
    && rule.action.type === "skip"
    && evaluateSemanticRuleNode(rule.when, url) === true,
  )
}
