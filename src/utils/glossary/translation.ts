import type { GlossaryEntry } from "@/types/config/glossary"
import type { ProviderConfig } from "@/types/config/provider"
import { isLLMProviderConfig } from "@/types/config/provider"

interface CompiledGlossaryEntry {
  id: string
  term: string
  normalizedTerm: string
  translation: string
  description: string
  llmOnly: boolean
  requireWordBoundary: boolean
}

interface TrieNode {
  children: Map<string, TrieNode>
  fail: TrieNode | null
  outputs: CompiledGlossaryEntry[]
}

interface GlossaryMatch {
  start: number
  end: number
  entry: CompiledGlossaryEntry
}

let cachedSignature = ""
let cachedEntries: CompiledGlossaryEntry[] = []
let cachedRoot: TrieNode | null = null

function createTrieNode(): TrieNode {
  return {
    children: new Map(),
    fail: null,
    outputs: [],
  }
}

function isAsciiWordChar(char: string | undefined): boolean {
  if (!char) {
    return false
  }

  const code = char.charCodeAt(0)
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
}

function normalizeEntries(entries: GlossaryEntry[]): CompiledGlossaryEntry[] {
  const normalizedEntryMap = new Map<string, CompiledGlossaryEntry>()

  for (const entry of entries) {
    const term = entry.term.trim()
    const translation = entry.translation.trim()
    if (!term || !translation) {
      continue
    }

    const normalizedTerm = term.toLowerCase()
    normalizedEntryMap.set(normalizedTerm, {
      id: entry.id,
      term,
      normalizedTerm,
      translation,
      description: entry.description.trim(),
      llmOnly: entry.llmOnly,
      requireWordBoundary: isAsciiWordChar(term[0]) && isAsciiWordChar(term[term.length - 1]),
    })
  }

  return Array.from(normalizedEntryMap.values())
}

function buildSignature(entries: CompiledGlossaryEntry[]): string {
  return entries
    .map(entry => `${entry.id}\u0001${entry.term}\u0001${entry.translation}\u0001${entry.description}\u0001${entry.llmOnly ? 1 : 0}`)
    .join("\u0002")
}

function compileGlossaryMatcher(entries: GlossaryEntry[]) {
  const normalizedEntries = normalizeEntries(entries)
  const signature = buildSignature(normalizedEntries)

  if (signature === cachedSignature && cachedRoot) {
    return {
      entries: cachedEntries,
      root: cachedRoot,
    }
  }

  const root = createTrieNode()
  root.fail = root

  for (const entry of normalizedEntries) {
    let node = root
    for (const char of entry.normalizedTerm) {
      let nextNode = node.children.get(char)
      if (!nextNode) {
        nextNode = createTrieNode()
        node.children.set(char, nextNode)
      }
      node = nextNode
    }
    node.outputs.push(entry)
  }

  const queue: TrieNode[] = []
  for (const child of root.children.values()) {
    child.fail = root
    queue.push(child)
  }

  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]

    for (const [char, child] of node.children.entries()) {
      let failNode = node.fail ?? root
      while (failNode !== root && !failNode.children.has(char)) {
        failNode = failNode.fail ?? root
      }

      child.fail = failNode.children.get(char) ?? root
      if (child.fail.outputs.length > 0) {
        child.outputs = child.outputs.concat(child.fail.outputs)
      }
      queue.push(child)
    }
  }

  cachedSignature = signature
  cachedEntries = normalizedEntries
  cachedRoot = root

  return {
    entries: normalizedEntries,
    root,
  }
}

function hasValidBoundary(text: string, start: number, end: number, entry: CompiledGlossaryEntry): boolean {
  if (!entry.requireWordBoundary) {
    return true
  }

  return !isAsciiWordChar(text[start - 1]) && !isAsciiWordChar(text[end])
}

function findGlossaryMatches(text: string, entries: GlossaryEntry[]): GlossaryMatch[] {
  const { entries: compiledEntries, root } = compileGlossaryMatcher(entries)
  if (compiledEntries.length === 0 || text.length === 0) {
    return []
  }

  const lowerText = text.toLowerCase()
  const matches: GlossaryMatch[] = []
  let node = root

  for (let index = 0; index < lowerText.length; index++) {
    const char = lowerText[index]

    while (node !== root && !node.children.has(char)) {
      node = node.fail ?? root
    }

    node = node.children.get(char) ?? root
    if (node.outputs.length === 0) {
      continue
    }

    for (const entry of node.outputs) {
      const start = index - entry.normalizedTerm.length + 1
      const end = index + 1
      if (start >= 0 && hasValidBoundary(text, start, end, entry)) {
        matches.push({ start, end, entry })
      }
    }
  }

  if (matches.length === 0) {
    return []
  }

  matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start))

  const selectedMatches: GlossaryMatch[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor) {
      continue
    }

    selectedMatches.push(match)
    cursor = match.end
  }

  return selectedMatches
}

function replaceMatchedGlossary(text: string, matches: GlossaryMatch[]): string {
  if (matches.length === 0) {
    return text
  }

  let cursor = 0
  let replacedText = ""

  for (const match of matches) {
    replacedText += text.slice(cursor, match.start)
    replacedText += match.entry.translation
    cursor = match.end
  }

  replacedText += text.slice(cursor)
  return replacedText
}

export function formatGlossaryPrompt(glossaryItems: Array<Pick<GlossaryEntry, "term" | "translation" | "description">>): string {
  if (glossaryItems.length === 0) {
    return ""
  }

  const uniqueItemMap = new Map<string, { term: string, translation: string, description: string }>()
  for (const item of glossaryItems) {
    const term = item.term.trim()
    const translation = item.translation.trim()
    if (!term || !translation) {
      continue
    }

    uniqueItemMap.set(term.toLowerCase(), {
      term,
      translation,
      description: item.description.trim(),
    })
  }

  return Array.from(uniqueItemMap.values())
    .sort((left, right) => left.term.localeCompare(right.term))
    .map((item, index) => item.description
      ? `${index + 1}. ${item.term}\nReference translation: ${item.translation}\nDescription: ${item.description}`
      : `${index + 1}. ${item.term}\nReference translation: ${item.translation}`)
    .join("\n\n")
}

export function prepareGlossaryTranslation(
  text: string,
  providerConfig: ProviderConfig,
  glossaryEntries: GlossaryEntry[],
): { text: string, glossaryPrompt: string } {
  if (!text || glossaryEntries.length === 0) {
    return { text, glossaryPrompt: "" }
  }

  const matches = findGlossaryMatches(text, glossaryEntries)
  if (matches.length === 0) {
    return { text, glossaryPrompt: "" }
  }

  if (isLLMProviderConfig(providerConfig)) {
    return {
      text,
      glossaryPrompt: formatGlossaryPrompt(matches.map(match => match.entry)),
    }
  }

  const machineMatches = matches.filter(match => !match.entry.llmOnly)
  return {
    text: replaceMatchedGlossary(text, machineMatches),
    glossaryPrompt: "",
  }
}
