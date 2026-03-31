import type { Config } from "@/types/config/config"
import type { NodeIgnoreHeuristicRule } from "@/types/config/translate"
import type { NodeIgnoreHeuristicsConfig } from "@/types/config/translate"
import type { TransNode } from "@/types/dom"
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

const FILE_SIZE_PATTERN = /^\d+(?:\.\d+)?\s?(?:b|kb|mb|gb|tb|pb|kib|mib|gib|tib|pib)$/i
const VERSION_PATTERN = /^(?:v|ver)\.?\s*\d+(?:\.\d+)*$/i
const HEX_HASH_PATTERN = /^[a-f0-9]{16,}$/i
const USERNAME_MENTION_PATTERN = /^@[a-z0-9_](?:[a-z0-9_.-]{0,37}[a-z0-9_])?$/i
const USERNAME_TEXT_PATTERN = /^[a-z0-9_](?:[a-z0-9_.-]{0,37}[a-z0-9_])?$/i
const USERNAME_HINT_PATTERN = /\b(?:user[-_.:\s]*name|user[-_.:\s]*handle|screen[-_.:\s]*name|nick[-_.:\s]*name|handle)\b/i
const REPOSITORY_SEGMENT_PATTERN = /^[a-z0-9_.-]+$/i
const UNIX_PATH_PATTERN = /^\/(?:[^/\s]+\/)*[^/\s]+\/?$/
const WINDOWS_PATH_PATTERN = /^[a-z0-9._-]+:\\(?:[^\\/\s]+\\)*[^\\/\s]+\\?$/i

const anchorCache = new WeakMap<Node, HTMLAnchorElement | null>()
const anchorTailCache = new WeakMap<HTMLAnchorElement, string | null>()
const anchorTailIsFileCache = new WeakMap<HTMLAnchorElement, boolean>()

export function matchesSemanticTagHeuristic(element: HTMLElement): boolean {
  return SEMANTIC_IGNORE_TAGS.has(element.tagName)
}

export function getEnabledNodeIgnoreHeuristicRulesFromConfig(config: NodeIgnoreHeuristicsConfig): NodeIgnoreHeuristicRule[] {
  return config.enabledRules
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

export function isFileSizeLike(text: string): boolean {
  return FILE_SIZE_PATTERN.test(text.trim())
}

export function isVersionLike(text: string): boolean {
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

function toHintComparableValue(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
}

function hasUsernameHint(value: string): boolean {
  const comparable = toHintComparableValue(value)
  if (!comparable) {
    return false
  }

  return USERNAME_HINT_PATTERN.test(comparable)
}

function getHeuristicElements(nodes: readonly TransNode[]): HTMLElement[] {
  const elements: HTMLElement[] = []
  const seen = new Set<HTMLElement>()

  for (const node of nodes) {
    const element = isHTMLElement(node) ? node : node.parentElement
    let current = element
    let depth = 0

    while (current && depth < 8) {
      if (!seen.has(current)) {
        seen.add(current)
        elements.push(current)
      }
      current = current.parentElement
      depth += 1
    }
  }

  return elements
}

function doesElementHintUsername(element: HTMLElement): boolean {
  if (Array.from(element.classList).some(hasUsernameHint)) {
    return true
  }

  for (const attribute of element.attributes) {
    if (hasUsernameHint(attribute.name) || hasUsernameHint(attribute.value)) {
      return true
    }
  }

  return false
}

export function isUsernameLikeContent(nodes: readonly TransNode[], text: string): boolean {
  const normalizedText = text.trim()
  if (!normalizedText || normalizedText.length > 40) {
    return false
  }

  const heuristicElements = getHeuristicElements(nodes)
  if (heuristicElements.some(doesElementHintUsername)) {
    return true
  }

  if (USERNAME_MENTION_PATTERN.test(normalizedText)) {
    return true
  }

  if (!USERNAME_TEXT_PATTERN.test(normalizedText) || isNumericContent(normalizedText)) {
    return false
  }

  return false
}

function isRepositoryLike(text: string): boolean {
  if (text.startsWith("/") || text.includes("\\") || text.includes(":")) {
    return false
  }

  const segments = text.split("/")
  if (segments.length !== 2 || text.length < 8) {
    return false
  }

  if (segments.some(segment => !segment || segment.length > 64 || !REPOSITORY_SEGMENT_PATTERN.test(segment))) {
    return false
  }

  return /[a-z]/i.test(text)
}

function isPathLike(text: string): boolean {
  return UNIX_PATH_PATTERN.test(text) || WINDOWS_PATH_PATTERN.test(text)
}

export function isRepoOrPathLikeContent(text: string): boolean {
  const normalizedText = text.trim()
  if (!normalizedText || normalizedText.length > 120 || /\s/.test(normalizedText)) {
    return false
  }

  return isRepositoryLike(normalizedText) || isPathLike(normalizedText)
}

export function isHashLikeOrFileNameContent(text: string): boolean {
  return isHexHashLike(text) || isFileNameLike(text)
}

export function matchesTextHeuristicRule(
  rule: Exclude<NodeIgnoreHeuristicRule, "semanticTags">,
  nodes: readonly TransNode[],
  text: string,
): boolean {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return false
  }

  switch (rule) {
    case "linkTextTail":
      return isLinkTextTailContent(nodes, normalizedText)
    case "shortFileLink":
      return isShortFileLinkContent(nodes, normalizedText)
    case "hashLikeOrFileName":
      return isHashLikeOrFileNameContent(normalizedText)
    case "usernameLike":
      return isUsernameLikeContent(nodes, normalizedText)
    case "repoOrPathLike":
      return isRepoOrPathLikeContent(normalizedText)
    case "versionLike":
      return isVersionLike(normalizedText)
    case "numericLike":
      return isNumericContent(normalizedText)
    case "fileSizeLike":
      return isFileSizeLike(normalizedText)
  }
}

export function shouldIgnoreTextByHeuristics(
  nodes: readonly TransNode[],
  text: string,
  config: Config,
): boolean {
  const enabledRules = config.translate.page.nodeIgnoreHeuristics.enabledRules.filter(
    (rule): rule is Exclude<NodeIgnoreHeuristicRule, "semanticTags"> => rule !== "semanticTags",
  )

  return enabledRules.some(rule => matchesTextHeuristicRule(rule, nodes, text))
}
