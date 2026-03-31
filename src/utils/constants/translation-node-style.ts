import { createObfuscatedClassName } from "./dom-labels"

export const DEFAULT_TRANSLATION_NODE_STYLE = "default"
export const TRANSLATION_NODE_STYLE_ON_INSTALLED = "textColor"

export const TRANSLATION_NODE_STYLE = [DEFAULT_TRANSLATION_NODE_STYLE, "blur", "blockquote", "weakened", "dashedLine", "border", "textColor", "background"] as const

export const LEGACY_CUSTOM_TRANSLATION_NODE_SELECTOR_REGEX = /\[data-read-frog-custom-translation-style(?:=(['"]?)custom\1)?\]/g
export const CUSTOM_TRANSLATION_NODE_CLASS = createObfuscatedClassName()
export const TRANSLATION_NODE_STYLE_CLASS_MAP = {
  blur: createObfuscatedClassName(),
  blockquote: createObfuscatedClassName(),
  weakened: createObfuscatedClassName(),
  dashedLine: createObfuscatedClassName(),
  border: createObfuscatedClassName(),
  textColor: createObfuscatedClassName(),
  background: createObfuscatedClassName(),
} as const
