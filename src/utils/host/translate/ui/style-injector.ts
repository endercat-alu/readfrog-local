import hostThemeCss from "@/assets/styles/host-theme.css?raw"
import {
  BLOCK_CONTENT_CLASS,
  CACHE_HIT_DEBUG_BADGE_CLASS,
  CACHE_HIT_DEBUG_TARGET_CLASS,
  CACHE_HIT_DEBUG_WRAPPER_CLASS,
  CONTENT_WRAPPER_CLASS,
  FAST_TRANSLATION_INDICATOR_CLASS,
  FAST_TRANSLATION_INDICATOR_STATE_ATTRIBUTE,
  INLINE_CONTENT_CLASS,
  createObfuscatedClassName,
} from "@/utils/constants/dom-labels"
import {
  CUSTOM_TRANSLATION_NODE_CLASS,
  LEGACY_CUSTOM_TRANSLATION_NODE_SELECTOR_REGEX,
  TRANSLATION_NODE_STYLE_CLASS_MAP,
} from "@/utils/constants/translation-node-style"

type StyleRoot = Document | ShadowRoot

// ============ Utilities ============

function supportsAdoptedStyleSheets(root: StyleRoot): boolean {
  if (root instanceof Document) {
    return false
  }

  try {
    return "adoptedStyleSheets" in root
      && root.adoptedStyleSheets !== undefined
      && Array.from(root.adoptedStyleSheets).every(sheet => sheet instanceof CSSStyleSheet)
  }
  catch {
    return false
  }
}

function getAdoptedStyleSheets(root: StyleRoot): CSSStyleSheet[] {
  return Array.from(root.adoptedStyleSheets)
}

function injectStyleElement(root: StyleRoot, id: string, cssText: string): void {
  const container = root instanceof Document ? root.head : root
  let styleElement = root.querySelector(`#${id}`) as HTMLStyleElement | null
  if (!styleElement) {
    const ownerDoc = root instanceof Document ? root : root.ownerDocument
    styleElement = ownerDoc.createElement("style")
    styleElement.id = id
    container.appendChild(styleElement)
  }
  if (styleElement.textContent !== cssText) {
    styleElement.textContent = cssText
  }
}

// ============ Preset Styles Injection ============

const HOST_THEME_CSS = hostThemeCss.replace(/:root/g, ":host")
const DOCUMENT_THEME_CSS = hostThemeCss
const PRESET_STYLE_ELEMENT_ID = createObfuscatedClassName()
const CUSTOM_STYLE_ELEMENT_ID = createObfuscatedClassName()

function buildTranslationBaseCSS(): string {
  return `
.${CONTENT_WRAPPER_CLASS},
.${CONTENT_WRAPPER_CLASS} * {
  overflow-wrap: anywhere;
  word-break: normal;
  user-select: text;
  text-decoration-skip-ink: auto;
}

.${CONTENT_WRAPPER_CLASS} {
  unicode-bidi: plaintext;
}

.${BLOCK_CONTENT_CLASS} {
  display: inline-block;
  margin: 8px 0 !important;
  color: inherit;
  font-family: inherit;
}

.${INLINE_CONTENT_CLASS} {
  display: inline;
  color: inherit;
  font-family: inherit;
  text-decoration: inherit;
}

.${FAST_TRANSLATION_INDICATOR_CLASS} {
  display: inline-block;
  width: 0.4em;
  height: 0.4em;
  margin-right: 0.45em;
  border-radius: 999px;
  vertical-align: 0.08em;
  background: color-mix(in srgb, var(--read-frog-primary) 38%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--read-frog-primary) 20%, transparent);
  opacity: 0.8;
}

.${FAST_TRANSLATION_INDICATOR_CLASS}[${FAST_TRANSLATION_INDICATOR_STATE_ATTRIBUTE}="preview"] {
  background: color-mix(in srgb, var(--read-frog-primary) 52%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--read-frog-primary) 28%, transparent),
    0 0 0 4px color-mix(in srgb, var(--read-frog-primary) 10%, transparent);
}

.${FAST_TRANSLATION_INDICATOR_CLASS}[${FAST_TRANSLATION_INDICATOR_STATE_ATTRIBUTE}="final"] {
  background: color-mix(in srgb, var(--read-frog-primary) 32%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--read-frog-primary) 16%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .${FAST_TRANSLATION_INDICATOR_CLASS}[${FAST_TRANSLATION_INDICATOR_STATE_ATTRIBUTE}="preview"] {
    animation: read-frog-fast-translation-indicator 1.6s ease-in-out infinite;
  }
}

@keyframes read-frog-fast-translation-indicator {
  0%, 100% {
    transform: scale(1);
    opacity: 0.82;
  }
  50% {
    transform: scale(1.18);
    opacity: 1;
  }
}

.${CACHE_HIT_DEBUG_WRAPPER_CLASS},
.${CACHE_HIT_DEBUG_TARGET_CLASS} {
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  outline: 1px solid color-mix(in srgb, #f59e0b 60%, transparent);
  border-radius: 6px;
}

.${CACHE_HIT_DEBUG_BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f59e0b;
  color: #111827;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0.02em;
  vertical-align: middle;
}
`
}

function buildTranslationPresetCSS(): string {
  return `
.${TRANSLATION_NODE_STYLE_CLASS_MAP.blur} {
  filter: blur(4px);
  opacity: 0.75;
  transition:
    filter 0.1s ease-in-out,
    opacity 0.1s ease-in-out;
}

.${TRANSLATION_NODE_STYLE_CLASS_MAP.blur}:hover {
  filter: blur(0);
  opacity: 1;
}

.${BLOCK_CONTENT_CLASS}.${TRANSLATION_NODE_STYLE_CLASS_MAP.blockquote} {
  border-left: 4px solid var(--read-frog-primary);
  padding: 4px 0 4px 8px;
}

.${TRANSLATION_NODE_STYLE_CLASS_MAP.weakened} {
  opacity: 1;
  color: var(--read-frog-muted-foreground) !important;
}

.${TRANSLATION_NODE_STYLE_CLASS_MAP.dashedLine} {
  text-decoration: underline dashed var(--read-frog-primary) !important;
  text-underline-offset: 5px;
}

.${TRANSLATION_NODE_STYLE_CLASS_MAP.border} {
  border: 1px solid var(--read-frog-primary);
  padding: 2px 4px;
  border-radius: 4px;
}

.${TRANSLATION_NODE_STYLE_CLASS_MAP.textColor} {
  color: var(--read-frog-primary) !important;
}

.${TRANSLATION_NODE_STYLE_CLASS_MAP.background} {
  background-color: color-mix(in srgb, var(--read-frog-primary) 15%, transparent);
  padding: 2px 4px;
  border-radius: 4px;
}
`
}

const DOCUMENT_PRESET_CSS = DOCUMENT_THEME_CSS + buildTranslationBaseCSS() + buildTranslationPresetCSS()
const SHADOW_PRESET_CSS = HOST_THEME_CSS + buildTranslationBaseCSS() + buildTranslationPresetCSS()

const injectedPresetRoots = new WeakSet<StyleRoot>()
let shadowPresetStyleSheet: CSSStyleSheet | null = null

function getPresetStyleSheet(cssText: string): CSSStyleSheet {
  if (!shadowPresetStyleSheet) {
    shadowPresetStyleSheet = new CSSStyleSheet()
    shadowPresetStyleSheet.replaceSync(cssText)
  }
  return shadowPresetStyleSheet
}

function getPresetCSS(root: StyleRoot): string {
  return root instanceof Document ? DOCUMENT_PRESET_CSS : SHADOW_PRESET_CSS
}

export function ensurePresetStyles(root: StyleRoot): void {
  if (injectedPresetRoots.has(root))
    return

  injectedPresetRoots.add(root)
  const cssText = getPresetCSS(root)

  if (supportsAdoptedStyleSheets(root)) {
    root.adoptedStyleSheets = [...getAdoptedStyleSheets(root), getPresetStyleSheet(cssText)]
  }
  else {
    injectStyleElement(root, PRESET_STYLE_ELEMENT_ID, cssText)
  }
}

// ============ Custom CSS Injection ============

const customCSSMap = new WeakMap<StyleRoot, CSSStyleSheet>()
let documentCachedCSS: string | null = null

/** Inject custom CSS into the given root */
export async function ensureCustomCSS(root: StyleRoot, cssText: string): Promise<void> {
  ensurePresetStyles(root)
  const normalizedCSSText = cssText.includes("data-read-frog-custom-translation-style")
    ? cssText.replace(
        LEGACY_CUSTOM_TRANSLATION_NODE_SELECTOR_REGEX,
        `.${CUSTOM_TRANSLATION_NODE_CLASS}`,
      )
    : cssText

  if (root instanceof Document && documentCachedCSS === normalizedCSSText) {
    return
  }

  if (supportsAdoptedStyleSheets(root)) {
    let sheet = customCSSMap.get(root)
    if (!sheet) {
      sheet = new CSSStyleSheet()
      customCSSMap.set(root, sheet)
      root.adoptedStyleSheets = [...getAdoptedStyleSheets(root), sheet]
    }
    await sheet.replace(normalizedCSSText)
  }
  else {
    injectStyleElement(root, CUSTOM_STYLE_ELEMENT_ID, normalizedCSSText)
  }

  if (root instanceof Document) {
    documentCachedCSS = normalizedCSSText
  }
}
