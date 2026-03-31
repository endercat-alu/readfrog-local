import type { Config } from "@/types/config/config"
import type { ContextMenuItem, SelectionToolbarAction } from "@/types/config/overlay-tools"
import type { SelectionToolbarCustomFeature } from "@/types/config/selection-toolbar"
import type { AIContentAwareMode, NodeIgnoreHeuristicRule, PageRule, PageTranslateRange } from "@/types/config/translate"
import { CUSTOM_FEATURE_TEMPLATES } from "./custom-feature-templates"
import { DEFAULT_TRANSLATE_PROMPTS_CONFIG } from "./prompt"
import { DEFAULT_PROVIDER_CONFIG_LIST } from "./providers"
import { DEFAULT_SIDE_CONTENT_WIDTH } from "./side"
import { DEFAULT_BACKGROUND_OPACITY, DEFAULT_DISPLAY_MODE, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SCALE, DEFAULT_FONT_WEIGHT, DEFAULT_SUBTITLE_COLOR, DEFAULT_SUBTITLE_POSITION, DEFAULT_TRANSLATION_POSITION } from "./subtitles"
import { DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY, DEFAULT_BATCH_CONFIG, DEFAULT_MIN_CHARACTERS_PER_NODE, DEFAULT_MIN_WORDS_PER_NODE, DEFAULT_PARAGRAPH_LINES_PER_SEGMENT, DEFAULT_PRELOAD_MARGIN, DEFAULT_PRELOAD_THRESHOLD, DEFAULT_REQUEST_CAPACITY, DEFAULT_REQUEST_RATE } from "./translate"
import { TRANSLATION_NODE_STYLE_ON_INSTALLED } from "./translation-node-style"
import { DEFAULT_TTS_CONFIG } from "./tts"

export const CONFIG_STORAGE_KEY = "config"
export const LAST_SYNCED_CONFIG_STORAGE_KEY = "lastSyncedConfig"
export const GOOGLE_DRIVE_TOKEN_STORAGE_KEY = "__googleDriveToken"

export const THEME_STORAGE_KEY = "theme"
export const DETECTED_CODE_STORAGE_KEY = "detectedCode"
export const DEFAULT_DETECTED_CODE = "eng" as const
export const CONFIG_SCHEMA_VERSION = 67

export const NODE_IGNORE_HEURISTIC_RULESET_VERSION = 3

export const DEFAULT_NODE_IGNORE_HEURISTIC_RULES: NodeIgnoreHeuristicRule[] = [
  "semanticTags",
  "linkTextTail",
  "shortFileLink",
  "hashLikeOrFileName",
  "usernameLike",
  "repoOrPathLike",
  "versionLike",
  "numericLike",
  "fileSizeLike",
]

export const DEFAULT_FLOATING_BUTTON_POSITION = 0.66
export const DEFAULT_SELECTION_TOOLBAR_BUTTON_ORDER: SelectionToolbarAction[] = [
  "vocabularyInsight",
  "translate",
  "speak",
  "customFeatures",
]
export const DEFAULT_CONTEXT_MENU_PAGE_ITEMS: ContextMenuItem[] = [
  "togglePageTranslation",
  "openOptions",
]
export const DEFAULT_CONTEXT_MENU_SELECTION_ITEMS: ContextMenuItem[] = [
  "selectionTranslate",
  "selectionVocabularyInsight",
  "selectionDictionary",
  "openOptions",
]
export const DEFAULT_CONTEXT_MENU_COMMON_ITEMS: ContextMenuItem[] = [
  "togglePageTranslation",
  "openOptions",
]

function createDefaultDictionaryFeature(): SelectionToolbarCustomFeature | null {
  const template = CUSTOM_FEATURE_TEMPLATES.find(t => t.id === "dictionary")
  if (!template)
    return null

  const feature = template.createFeature("openai-default")
  return {
    ...feature,
    id: "default-dictionary",
    outputSchema: feature.outputSchema.map(field => ({
      ...field,
      id: field.id.startsWith("dictionary-")
        ? `default-${field.id}`
        : `default-dictionary-${field.id}`,
    })),
  }
}

const defaultDictionaryFeature = createDefaultDictionaryFeature()

function createDefaultHeuristicRule(): PageRule {
  return {
    id: "rule-skip-heuristic-nodes",
    name: "Skip heuristic nodes",
    enabled: true,
    when: {
      kind: "group",
      id: "group-skip-heuristic-nodes",
      operator: "or",
      items: DEFAULT_NODE_IGNORE_HEURISTIC_RULES.map((rule, index) => ({
        kind: "condition" as const,
        id: `condition-skip-heuristic-nodes-${index}`,
        field: "heuristic" as const,
        value: rule,
      })),
    },
    action: {
      type: "skip",
      scope: "paragraph",
    },
  }
}

function createDefaultAutoTranslateWebsitesRule(): PageRule {
  return {
    id: "rule-auto-translate-websites",
    name: "Auto translate websites",
    enabled: false,
    when: {
      kind: "group",
      id: "group-auto-translate-websites",
      operator: "or",
      items: [],
    },
    action: {
      type: "translate",
      scope: "page",
    },
  }
}

function createDefaultAutoTranslateLanguagesRule(): PageRule {
  return {
    id: "rule-auto-translate-languages",
    name: "Auto translate languages",
    enabled: false,
    when: {
      kind: "group",
      id: "group-auto-translate-languages",
      operator: "or",
      items: [],
    },
    action: {
      type: "translate",
      scope: "page",
    },
  }
}

function createDefaultSkipParagraphLanguagesRule(): PageRule {
  return {
    id: "rule-skip-paragraph-languages",
    name: "Skip paragraph languages",
    enabled: false,
    when: {
      kind: "group",
      id: "group-skip-paragraph-languages",
      operator: "or",
      items: [],
    },
    action: {
      type: "skip",
      scope: "paragraph",
    },
  }
}

function createDefaultSkipShortTextRule(): PageRule {
  return {
    id: "rule-skip-short-text",
    name: "Skip short text",
    enabled: false,
    when: {
      kind: "group",
      id: "group-skip-short-text",
      operator: "or",
      items: [],
    },
    action: {
      type: "skip",
      scope: "paragraph",
    },
  }
}

export const DEFAULT_CONFIG: Config = {
  language: {
    sourceCode: "auto",
    targetCode: "cmn",
    level: "intermediate",
  },
  providersConfig: DEFAULT_PROVIDER_CONFIG_LIST,
  translate: {
    providerId: "microsoft-translate-default",
    mode: "bilingual",
    enableShortTextCache: true,
    node: {
      enabled: true,
      hotkey: "control",
    },
    page: {
      // TODO: change this to "all" for users once our translation algorithm can handle most cases elegantly
      range: import.meta.env.DEV ? "all" : "main",
      rules: [
        createDefaultAutoTranslateWebsitesRule(),
        createDefaultAutoTranslateLanguagesRule(),
        createDefaultSkipParagraphLanguagesRule(),
        createDefaultSkipShortTextRule(),
        createDefaultHeuristicRule(),
      ],
      minCharactersPerNode: DEFAULT_MIN_CHARACTERS_PER_NODE,
      minWordsPerNode: DEFAULT_MIN_WORDS_PER_NODE,
      nodeIgnoreHeuristics: {
        rulesetVersion: NODE_IGNORE_HEURISTIC_RULESET_VERSION,
        enabledRules: DEFAULT_NODE_IGNORE_HEURISTIC_RULES,
      },
      shortcut: DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY,
      preload: {
        margin: DEFAULT_PRELOAD_MARGIN,
        threshold: DEFAULT_PRELOAD_THRESHOLD,
      },
      paragraphSegmentation: {
        enabledRules: ["blankLine"],
        maxLinesPerParagraph: DEFAULT_PARAGRAPH_LINES_PER_SEGMENT,
      },
    },
    enableAIContentAware: false,
    aiContentAwareMode: "viewport",
    customPromptsConfig: DEFAULT_TRANSLATE_PROMPTS_CONFIG,
    requestQueueConfig: {
      capacity: DEFAULT_REQUEST_CAPACITY,
      rate: DEFAULT_REQUEST_RATE,
    },
    batchQueueConfig: {
      maxCharactersPerBatch: DEFAULT_BATCH_CONFIG.maxCharactersPerBatch,
      maxItemsPerBatch: DEFAULT_BATCH_CONFIG.maxItemsPerBatch,
    },
    translationNodeStyle: {
      preset: TRANSLATION_NODE_STYLE_ON_INSTALLED,
      isCustom: false,
      customCSS: null,
    },
  },
  tts: DEFAULT_TTS_CONFIG,
  floatingButton: {
    enabled: true,
    position: DEFAULT_FLOATING_BUTTON_POSITION,
    disabledFloatingButtonPatterns: [],
    clickAction: "translate",
    appearance: {
      side: "right",
      expandMode: "hover",
      showQuickTranslateButton: true,
      showSettingsButton: true,
      showCloseButton: true,
      idleOpacity: 0.6,
      scale: 1,
    },
  },
  selectionToolbar: {
    enabled: true,
    disabledSelectionToolbarPatterns: [],
    features: {
      translate: {
        providerId: "microsoft-translate-default",
      },
      vocabularyInsight: {
        providerId: "openai-default",
      },
    },
    customFeatures: defaultDictionaryFeature ? [defaultDictionaryFeature] : [],
    appearance: {
      buttonOrder: DEFAULT_SELECTION_TOOLBAR_BUTTON_ORDER,
      showCloseButton: true,
      buttonSize: 24,
      maxWidth: 420,
    },
  },
  sideContent: {
    width: DEFAULT_SIDE_CONTENT_WIDTH,
  },
  contextMenu: {
    enabled: true,
    contexts: {
      page: {
        enabled: true,
        collapsed: false,
        items: DEFAULT_CONTEXT_MENU_PAGE_ITEMS,
      },
      selection: {
        enabled: true,
        collapsed: true,
        items: DEFAULT_CONTEXT_MENU_SELECTION_ITEMS,
      },
      link: {
        enabled: false,
        collapsed: true,
        items: DEFAULT_CONTEXT_MENU_COMMON_ITEMS,
      },
      image: {
        enabled: false,
        collapsed: true,
        items: DEFAULT_CONTEXT_MENU_COMMON_ITEMS,
      },
      editable: {
        enabled: false,
        collapsed: true,
        items: DEFAULT_CONTEXT_MENU_COMMON_ITEMS,
      },
    },
  },
  inputTranslation: {
    enabled: true,
    providerId: "microsoft-translate-default",
    fromLang: "targetCode",
    toLang: "sourceCode",
    enableCycle: false,
    timeThreshold: 300,
  },
  videoSubtitles: {
    enabled: true,
    autoStart: false,
    providerId: "microsoft-translate-default",
    style: {
      displayMode: DEFAULT_DISPLAY_MODE,
      translationPosition: DEFAULT_TRANSLATION_POSITION,
      main: {
        fontFamily: DEFAULT_FONT_FAMILY,
        fontScale: DEFAULT_FONT_SCALE,
        color: DEFAULT_SUBTITLE_COLOR,
        fontWeight: DEFAULT_FONT_WEIGHT,
      },
      translation: {
        fontFamily: DEFAULT_FONT_FAMILY,
        fontScale: DEFAULT_FONT_SCALE,
        color: DEFAULT_SUBTITLE_COLOR,
        fontWeight: DEFAULT_FONT_WEIGHT,
      },
      container: {
        backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
      },
    },
    aiSegmentation: false,
    requestQueueConfig: {
      capacity: DEFAULT_REQUEST_CAPACITY,
      rate: DEFAULT_REQUEST_RATE,
    },
    batchQueueConfig: {
      maxCharactersPerBatch: DEFAULT_BATCH_CONFIG.maxCharactersPerBatch,
      maxItemsPerBatch: DEFAULT_BATCH_CONFIG.maxItemsPerBatch,
    },
    customPromptsConfig: DEFAULT_TRANSLATE_PROMPTS_CONFIG,
    position: DEFAULT_SUBTITLE_POSITION,
  },
  glossary: {
    entries: [],
  },
  siteControl: {
    mode: "blacklist",
    blacklistPatterns: [],
    whitelistPatterns: [],
  },
}

export const PAGE_TRANSLATE_RANGE_ITEMS: Record<
  PageTranslateRange,
  { label: string }
> = {
  main: { label: "Main" },
  all: { label: "All" },
}

export const AI_CONTENT_AWARE_MODE_ITEMS: Record<
  AIContentAwareMode,
  { label: string }
> = {
  viewport: { label: "Viewport" },
  document: { label: "Document" },
}
