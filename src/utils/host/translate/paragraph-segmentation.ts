import type { Config } from "@/types/config/config"
import { unwrapDeepestOnlyHTMLChild } from "../dom/find"
import { isTextNode } from "../dom/filter"

interface RangePart {
  kind: "content" | "separator"
  start: number
  end: number
  forceBoundaryAfter?: boolean
}

interface MaterializedPart {
  kind: "content" | "separator"
  node: Text
  forceBoundaryAfter: boolean
}

const BLANK_LINE_SEPARATOR_REGEX = /\r?\n(?:[^\S\r\n]*\r?\n)+/g
const RECT_TOP_EPSILON = 0.5

function countUniqueLineTops(rects: DOMRectList | DOMRect[]): number {
  const tops: number[] = []

  Array.from(rects).forEach((rect) => {
    if (!tops.some(top => Math.abs(top - rect.top) < RECT_TOP_EPSILON)) {
      tops.push(rect.top)
    }
  })

  return tops.length
}

function measureRangeLineCount(node: Text, start: number, end: number): number {
  if (start >= end) {
    return 0
  }

  const range = node.ownerDocument.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const lineCount = countUniqueLineTops(range.getClientRects())
  return lineCount || 1
}

function splitRangeByBlankLines(text: string, start: number, end: number): RangePart[] {
  const rangeText = text.slice(start, end)
  const separatorRegex = new RegExp(BLANK_LINE_SEPARATOR_REGEX.source, "g")
  const parts: RangePart[] = []
  let cursor = 0

  for (const match of rangeText.matchAll(separatorRegex)) {
    const matchStart = start + (match.index ?? 0)
    const matchEnd = matchStart + match[0].length

    if (matchStart > start + cursor) {
      parts.push({
        kind: "content",
        start: start + cursor,
        end: matchStart,
      })
    }

    parts.push({
      kind: "separator",
      start: matchStart,
      end: matchEnd,
    })

    cursor = matchEnd - start
  }

  if (start + cursor < end) {
    parts.push({
      kind: "content",
      start: start + cursor,
      end,
    })
  }

  return parts.length > 0
    ? parts
    : [{ kind: "content", start, end }]
}

function findWhitespaceBoundary(text: string, start: number, end: number): number {
  for (let index = end; index > start; index--) {
    if (/\s/.test(text[index - 1])) {
      return index
    }
  }
  return end
}

function splitRangeByVisualLines(node: Text, start: number, end: number, maxLinesPerParagraph: number): RangePart[] {
  if (measureRangeLineCount(node, start, end) <= maxLinesPerParagraph) {
    return [{ kind: "content", start, end }]
  }

  const text = node.data
  const parts: RangePart[] = []
  let cursor = start

  while (cursor < end) {
    if (measureRangeLineCount(node, cursor, end) <= maxLinesPerParagraph) {
      parts.push({ kind: "content", start: cursor, end })
      break
    }

    let low = cursor + 1
    let high = end
    let best = cursor + 1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const lineCount = measureRangeLineCount(node, cursor, mid)

      if (lineCount <= maxLinesPerParagraph) {
        best = mid
        low = mid + 1
      }
      else {
        high = mid - 1
      }
    }

    let boundary = findWhitespaceBoundary(text, cursor, best)
    if (boundary <= cursor) {
      boundary = best
    }

    parts.push({
      kind: "content",
      start: cursor,
      end: boundary,
      forceBoundaryAfter: true,
    })
    cursor = boundary
  }

  if (parts.length > 1) {
    parts[parts.length - 1].forceBoundaryAfter = false
  }

  return parts
}

function createRangeParts(node: Text, config: Config): RangePart[] {
  const text = node.data
  const { enabledRules, maxLinesPerParagraph } = config.translate.page.paragraphSegmentation

  if (!text.trim()) {
    return [{ kind: "content", start: 0, end: text.length }]
  }

  let parts: RangePart[] = [{ kind: "content", start: 0, end: text.length }]

  if (enabledRules.includes("blankLine")) {
    parts = parts.flatMap(part =>
      part.kind === "content"
        ? splitRangeByBlankLines(text, part.start, part.end)
        : [part],
    )
  }

  if (enabledRules.includes("visualLines")) {
    parts = parts.flatMap(part =>
      part.kind === "content"
        ? splitRangeByVisualLines(node, part.start, part.end, maxLinesPerParagraph)
        : [part],
    )
  }

  return parts
}

function materializeParts(node: Text, parts: RangePart[]): MaterializedPart[] {
  if (
    parts.length === 1
    && parts[0].kind === "content"
    && parts[0].start === 0
    && parts[0].end === node.data.length
    && !parts[0].forceBoundaryAfter
  ) {
    return [{
      kind: "content",
      node,
      forceBoundaryAfter: false,
    }]
  }

  const ownerDoc = node.ownerDocument
  const fragment = ownerDoc.createDocumentFragment()
  const materialized: MaterializedPart[] = []

  parts.forEach((part) => {
    const pieceNode = ownerDoc.createTextNode(node.data.slice(part.start, part.end))
    fragment.appendChild(pieceNode)
    materialized.push({
      kind: part.kind,
      node: pieceNode,
      forceBoundaryAfter: !!part.forceBoundaryAfter,
    })
  })

  node.replaceWith(fragment)
  return materialized
}

export async function splitElementIntoParagraphGroups(
  element: HTMLElement,
  config: Config,
): Promise<ChildNode[][] | null> {
  const targetElement = await unwrapDeepestOnlyHTMLChild(element)
  const groups: ChildNode[][] = []
  let currentGroup: ChildNode[] = []

  const pushGroup = () => {
    if (currentGroup.length > 0) {
      groups.push(currentGroup)
      currentGroup = []
    }
  }

  const children = Array.from(targetElement.childNodes)
  children.forEach((child) => {
    if (!isTextNode(child)) {
      currentGroup.push(child)
      return
    }

    const parts = materializeParts(child, createRangeParts(child, config))
    parts.forEach((part) => {
      if (part.kind === "separator") {
        pushGroup()
        return
      }

      currentGroup.push(part.node)
      if (part.forceBoundaryAfter) {
        pushGroup()
      }
    })
  })

  pushGroup()

  return groups.length > 1 ? groups : null
}
