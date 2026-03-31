import type { TranslationNodeStyleConfig } from "@/types/config/translate"
import { translationNodeStylePresetSchema } from "@/types/config/translate"
import {
  CUSTOM_TRANSLATION_NODE_CLASS,
  DEFAULT_TRANSLATION_NODE_STYLE,
  TRANSLATION_NODE_STYLE_CLASS_MAP,
} from "@/utils/constants/translation-node-style"
import { getContainingShadowRoot } from "../../dom/node"
import { ensureCustomCSS, ensurePresetStyles } from "./style-injector"
const TRANSLATION_STYLE_CLASSES = [
  CUSTOM_TRANSLATION_NODE_CLASS,
  ...Object.values(TRANSLATION_NODE_STYLE_CLASS_MAP),
]

export async function decorateTranslationNode(
  translatedNode: HTMLElement,
  styleConfig: TranslationNodeStyleConfig,
): Promise<void> {
  if (translationNodeStylePresetSchema.safeParse(styleConfig.preset).error)
    return

  const root = getContainingShadowRoot(translatedNode) ?? document
  translatedNode.classList.remove(...TRANSLATION_STYLE_CLASSES)
  ensurePresetStyles(root)

  if (styleConfig.isCustom && styleConfig.customCSS) {
    translatedNode.classList.add(CUSTOM_TRANSLATION_NODE_CLASS)
    await ensureCustomCSS(root, styleConfig.customCSS)
    return
  }

  if (styleConfig.preset === DEFAULT_TRANSLATION_NODE_STYLE) {
    return
  }

  const presetClass = TRANSLATION_NODE_STYLE_CLASS_MAP[styleConfig.preset]
  if (presetClass) {
    translatedNode.classList.add(presetClass)
  }
}
