import type { Config } from "@/types/config/config"
import type { NodeIgnoreHeuristicRule } from "@/types/config/translate"
import type { TransNode } from "@/types/dom"
import { DEFAULT_NODE_IGNORE_HEURISTIC_RULES, NODE_IGNORE_HEURISTIC_RULESET_VERSION } from "@/utils/constants/config"
import { SEMANTIC_IGNORE_TAGS } from "@/utils/constants/dom-rules"
import { isHTMLElement } from "../dom/filter"
import { isNumericContent } from "./ui/translation-utils"

const COMMON_FILE_EXTENSIONS = new Set([
  "7z",
  "aac",
  "apk",
  "avi",
  "bz2",
  "css",
  "csv",
  "dmg",
  "doc",
  "docx",
  "epub",
  "exe",
  "flac",
  "gif",
  "gz",
  "html",
  "iso",
  "jpeg",
  "jpg",
  "js",
  "json",
  "m4a",
  "mjs",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "msi",
  "ogg",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "rar",
  "rpm",
  "svg",
  "tar",
  "tgz",
  "txt",
  "wav",
  "webm",
  "webp",
  "xls",
  "xlsx",
  "xml",
  "xz",
  "yaml",
  "yml",
  "zip",
  "zst",
])

const NEW_NODE_IGNORE_HEURISTIC_RULES: NodeIgnoreHeuristicRule[] = [
  "shortFileLink",
  "versionLike",
  "fileSizeLike",
]

const FILE_SIZE_PATTERN = /^\d+(?:\.\d+)?\s?(?:b|kb|mb|gb|tb|pb|kib|mib|gib|tib|pib)$/i
const VERSION_PATTERN = /^(?:v|ver)\.?\s*\d+(?:\.\d+)*$/i
const HEX_HASH_PATTERN = /^[a-f0-9]{16,}$/i

const anchorCache = new WeakMap<Node, HTMLAnchorElement | null>()
const anchorTailCache = new WeakMap<HTMLAnchorElement, string | null>()
const anchorTailIsFileCache = new WeakMap<HTMLAnchorElement, boolean>()

export function getEnabledNodeIgnoreHeuristicRulesFromConfig(
  heuristicConfig: Config["translate"]["page"]["nodeIgnoreHeuristics"] | undefined,
): NodeIgnoreHeuristicRule[] {
  const enabledRules = heuristicConfig?.enabledRules ?? DEFAULT_NODE_IGNORE_HEURISTIC_RULES

  if ((heuristicConfig?.rulesetVersion ?? 1) >= NODE_IGNORE_HEURISTIC_RULESET_VERSION) {
    return enabledRules
  }

  return Array.from(new Set([...enabledRules, ...NEW_NODE_IGNORE_HEURISTIC_RULES]))
}

export function getEnabledNodeIgnoreHeuristicRules(config: Config): NodeIgnoreHeuristicRule[] {
  return getEnabledNodeIgnoreHeuristicRulesFromConfig(config.translate.page.nodeIgnoreHeuristics)
}

export function isNodeIgnoreHeuristicEnabled(config: Config, rule: NodeIgnoreHeuristicRule): boolean {
  return getEnabledNodeIgnoreHeuristicRules(config).includes(rule)
}

export function shouldIgnoreElementBySemanticTagHeuristic(element: HTMLElement, config: Config): boolean {
  return isNodeIgnoreHeuristicEnabled(config, "semanticTags")
    && SEMANTIC_IGNORE_TAGS.has(element.tagName)
}

function getAnchorForNode(node: TransNode): HTMLElement | null {
  const cached = anchorCache.get(node)
  if (cached !== undefined) {
    return cached
  }

  if (isHTMLElement(node)) {
    const anchor = node.closest("a[href]")
    if (anchor && anchor.tagName === "A") {
      anchorCache.set(node, anchor as HTMLAnchorElement)
      return anchor as HTMLAnchorElement
    }

    const anchors = node.getElementsByTagName("a")
    if (anchors.length === 1) {
      const onlyAnchor = anchors[0]
      if (node.textContent?.trim() === onlyAnchor.textContent?.trim()) {
        anchorCache.set(node, onlyAnchor)
        return onlyAnchor
      }
    }

    anchorCache.set(node, null)
    return null
  }

  const anchor = node.parentElement?.closest("a[href]")
  const result = anchor && anchor.tagName === "A" ? anchor as HTMLAnchorElement : null
  anchorCache.set(node, result)
  return result
}

function getSharedAnchor(nodes: readonly TransNode[]): HTMLElement | null {
  let sharedAnchor: HTMLElement | null = null

  for (const node of nodes) {
    const anchor = getAnchorForNode(node)
    if (!anchor) {
      return null
    }

    if (!sharedAnchor) {
      sharedAnchor = anchor
      continue
    }

    if (sharedAnchor !== anchor) {
      return null
    }
  }

  return sharedAnchor
}

function getUrlTail(href: string): string | null {
  try {
    const url = new URL(href, window.location.href)
    const segments = url.pathname.split("/").filter(Boolean)
    const tail = segments.at(-1)
    return tail ? decodeURIComponent(tail) : null
  }
  catch {
    return null
  }
}

function isFileSizeLike(text: string): boolean {
  return FILE_SIZE_PATTERN.test(text.trim())
}

function isVersionLike(text: string): boolean {
  return VERSION_PATTERN.test(text.trim())
}

function getAnchorTail(anchor: HTMLAnchorElement): string | null {
  const cached = anchorTailCache.get(anchor)
  if (cached !== undefined) {
    return cached
  }

  const href = anchor.getAttribute("href")
  const tail = href ? getUrlTail(href) : null
  anchorTailCache.set(anchor, tail)
  return tail
}

function doesAnchorLookLikeFileLink(anchor: HTMLAnchorElement): boolean {
  const cached = anchorTailIsFileCache.get(anchor)
  if (cached !== undefined) {
    return cached
  }

  const result = isFileNameLike(getAnchorTail(anchor) ?? "")
  anchorTailIsFileCache.set(anchor, result)
  return result
}

export function isLinkTextTailContent(nodes: readonly TransNode[], text: string): boolean {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return false
  }

  const anchor = getSharedAnchor(nodes)
  if (!anchor) {
    return false
  }

  const tail = getAnchorTail(anchor as HTMLAnchorElement)
  if (!tail) {
    return false
  }

  if (normalizedText === tail) {
    return true
  }

  return isFileNameLike(tail) && normalizedText.length <= 30
}

export function isShortFileLinkContent(nodes: readonly TransNode[], text: string): boolean {
  const normalizedText = text.trim()
  if (!normalizedText || normalizedText.length > 30) {
    return false
  }

  const anchor = getSharedAnchor(nodes)
  if (!anchor) {
    return false
  }

  return doesAnchorLookLikeFileLink(anchor as HTMLAnchorElement)
}

function isHexHashLike(text: string): boolean {
  return HEX_HASH_PATTERN.test(text.trim())
}

function isFileNameLike(text: string): boolean {
  const normalizedText = text.trim()
  if (!normalizedText || normalizedText.length > 64 || !normalizedText.includes(".") || /\s/.test(normalizedText)) {
    return false
  }

  const baseName = normalizedText
    .split(/[\\/]/)
    .pop()
    ?.replace(/[?#].*$/, "")

  if (!baseName) {
    return false
  }

  const match = baseName.match(/\.([a-z0-9]{1,8})$/i)
  if (!match) {
    return false
  }

  return COMMON_FILE_EXTENSIONS.has(match[1].toLowerCase())
}

export function isHashLikeOrFileNameContent(text: string): boolean {
  return isHexHashLike(text) || isFileNameLike(text)
}

export function shouldIgnoreTextByHeuristics(
  nodes: readonly TransNode[],
  text: string,
  config: Config,
): boolean {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return false
  }

  const enabledRules = getEnabledNodeIgnoreHeuristicRules(config)
  const linkTextTailEnabled = enabledRules.includes("linkTextTail")
  const shortFileLinkEnabled = enabledRules.includes("shortFileLink")
  const hashLikeOrFileNameEnabled = enabledRules.includes("hashLikeOrFileName")
  const versionLikeEnabled = enabledRules.includes("versionLike")
  const numericLikeEnabled = enabledRules.includes("numericLike")
  const fileSizeLikeEnabled = enabledRules.includes("fileSizeLike")

  if (linkTextTailEnabled && isLinkTextTailContent(nodes, normalizedText)) {
    return true
  }

  if (shortFileLinkEnabled && isShortFileLinkContent(nodes, normalizedText)) {
    return true
  }

  if (hashLikeOrFileNameEnabled && isHashLikeOrFileNameContent(normalizedText)) {
    return true
  }

  if (versionLikeEnabled && isVersionLike(normalizedText)) {
    return true
  }

  if (numericLikeEnabled && isNumericContent(normalizedText)) {
    return true
  }

  if (fileSizeLikeEnabled && isFileSizeLike(normalizedText)) {
    return true
  }

  return false
}
