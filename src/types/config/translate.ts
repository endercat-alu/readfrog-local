import { langCodeISO6393Schema } from "@read-frog/definitions"
import { z } from "zod"
import { HOTKEYS } from "@/utils/constants/hotkeys"
import { DEFAULT_PARAGRAPH_LINES_PER_SEGMENT, MAX_PRELOAD_MARGIN, MAX_PRELOAD_THRESHOLD, MIN_BATCH_CHARACTERS, MIN_BATCH_ITEMS, MIN_CHARACTERS_PER_NODE, MIN_PARAGRAPH_LINES_PER_SEGMENT, MIN_PRELOAD_MARGIN, MIN_PRELOAD_THRESHOLD, MIN_TRANSLATE_CAPACITY, MIN_TRANSLATE_RATE, MIN_WORDS_PER_NODE } from "@/utils/constants/translate"
import { TRANSLATION_NODE_STYLE } from "@/utils/constants/translation-node-style"

export const requestQueueConfigSchema = z.object({
  capacity: z.number().gte(MIN_TRANSLATE_CAPACITY),
  rate: z.number().gte(MIN_TRANSLATE_RATE),
})

export const batchQueueConfigSchema = z.object({
  maxCharactersPerBatch: z.number().gte(MIN_BATCH_CHARACTERS),
  maxItemsPerBatch: z.number().gte(MIN_BATCH_ITEMS),
})

export const TRANSLATION_MODES = ["bilingual", "translationOnly"] as const
export const translationModeSchema = z.enum(TRANSLATION_MODES)

export const pageTranslateRangeSchema = z.enum(["main", "all"])
export type PageTranslateRange = z.infer<typeof pageTranslateRangeSchema>

export const AI_CONTENT_AWARE_MODES = ["viewport", "document"] as const
export const aiContentAwareModeSchema = z.enum(AI_CONTENT_AWARE_MODES)
export type AIContentAwareMode = z.infer<typeof aiContentAwareModeSchema>

export const PARAGRAPH_SEGMENTATION_RULES = ["blankLine", "visualLines"] as const
export const paragraphSegmentationRuleSchema = z.enum(PARAGRAPH_SEGMENTATION_RULES)
export type ParagraphSegmentationRule = z.infer<typeof paragraphSegmentationRuleSchema>

export const paragraphSegmentationConfigSchema = z.object({
  enabledRules: z.array(paragraphSegmentationRuleSchema),
  maxLinesPerParagraph: z.number().int().min(MIN_PARAGRAPH_LINES_PER_SEGMENT).default(DEFAULT_PARAGRAPH_LINES_PER_SEGMENT),
})
export type ParagraphSegmentationConfig = z.infer<typeof paragraphSegmentationConfigSchema>

export const NODE_IGNORE_HEURISTIC_RULES = [
  "semanticTags",
  "linkTextTail",
  "shortFileLink",
  "hashLikeOrFileName",
  "usernameLike",
  "repoOrPathLike",
  "versionLike",
  "numericLike",
  "fileSizeLike",
] as const
export const nodeIgnoreHeuristicRuleSchema = z.enum(NODE_IGNORE_HEURISTIC_RULES)
export type NodeIgnoreHeuristicRule = z.infer<typeof nodeIgnoreHeuristicRuleSchema>

export const nodeIgnoreHeuristicsConfigSchema = z.object({
  rulesetVersion: z.number().int().default(1),
  enabledRules: z.array(nodeIgnoreHeuristicRuleSchema),
})
export type NodeIgnoreHeuristicsConfig = z.infer<typeof nodeIgnoreHeuristicsConfigSchema>

export const preloadConfigSchema = z.object({
  margin: z.number().min(MIN_PRELOAD_MARGIN).max(MAX_PRELOAD_MARGIN),
  threshold: z.number().min(MIN_PRELOAD_THRESHOLD).max(MAX_PRELOAD_THRESHOLD),
})
export type PreloadConfig = z.infer<typeof preloadConfigSchema>

// Translation node style preset (excluding 'custom' - controlled by isCustom flag)
export const translationNodeStylePresetSchema = z.enum(TRANSLATION_NODE_STYLE)
export type TranslationNodeStylePreset = z.infer<typeof translationNodeStylePresetSchema>

export const MAX_CUSTOM_CSS_LENGTH = 8192

// Translation node style configuration
export const translationNodeStyleConfigSchema = z.object({
  preset: translationNodeStylePresetSchema,
  isCustom: z.boolean(),
  customCSS: z.string()
    .max(MAX_CUSTOM_CSS_LENGTH, "Custom CSS cannot exceed 8KB")
    .nullable(),
})

export type TranslationNodeStyleConfig = z.infer<typeof translationNodeStyleConfigSchema>

export const translatePromptObjSchema = z.object({
  name: z.string(),
  id: z.string(),
  systemPrompt: z.string(),
  prompt: z.string(),
})
export type TranslatePromptObj = z.infer<typeof translatePromptObjSchema>

export const customPromptsConfigSchema = z.object({
  promptId: z.string().nullable(),
  patterns: z.array(
    translatePromptObjSchema,
  ),
}).superRefine((data, ctx) => {
  if (data.promptId !== null) {
    const patternIds = data.patterns.map(p => p.id)
    if (!patternIds.includes(data.promptId)) {
      ctx.addIssue({
        code: "invalid_value",
        values: patternIds,
        message: `promptId "${data.promptId}" must be null or match a pattern id`,
        path: ["promptId"],
      })
    }
  }
})

export const translateConfigSchema = z.object({
  providerId: z.string().nonempty(),
  mode: translationModeSchema,
  enableShortTextCache: z.boolean(),
  node: z.object({
    enabled: z.boolean(),
    hotkey: z.enum(HOTKEYS),
  }),
  page: z.object({
    range: pageTranslateRangeSchema,
    autoTranslatePatterns: z.array(z.string()),
    autoTranslateLanguages: z.array(langCodeISO6393Schema),
    shortcut: z.array(z.string()),
    enableLLMDetection: z.boolean(),
    preload: preloadConfigSchema,
    minCharactersPerNode: z.number().min(MIN_CHARACTERS_PER_NODE),
    minWordsPerNode: z.number().min(MIN_WORDS_PER_NODE),
    skipLanguages: z.array(langCodeISO6393Schema),
    enableSkipLanguagesLLMDetection: z.boolean(),
    paragraphSegmentation: paragraphSegmentationConfigSchema,
    nodeIgnoreHeuristics: nodeIgnoreHeuristicsConfigSchema,
  }),
  enableAIContentAware: z.boolean(),
  aiContentAwareMode: aiContentAwareModeSchema,
  customPromptsConfig: customPromptsConfigSchema,
  requestQueueConfig: requestQueueConfigSchema,
  batchQueueConfig: batchQueueConfigSchema,
  translationNodeStyle: translationNodeStyleConfigSchema,
})

export type RequestQueueConfig = z.infer<typeof requestQueueConfigSchema>
export type BatchQueueConfig = z.infer<typeof batchQueueConfigSchema>
export type TranslateConfig = z.infer<typeof translateConfigSchema>
export type TranslationMode = z.infer<typeof translationModeSchema>
