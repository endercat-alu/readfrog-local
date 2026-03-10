import type { Config } from "@/types/config/config"
import type { TransNode } from "@/types/dom"
import {
  BLOCK_ATTRIBUTE,
  INLINE_ATTRIBUTE,
  PARAGRAPH_ATTRIBUTE,
  WALKED_ATTRIBUTE,
} from "@/utils/constants/dom-labels"
import { FORCE_BLOCK_TAGS } from "@/utils/constants/dom-rules"
import {
  isCustomForceBlockTranslation,
  isDontWalkIntoAndDontTranslateAsChildElement,
  isDontWalkIntoButTranslateAsChildElement,
  isHTMLElement,
  isShallowBlockHTMLElement,
  isShallowInlineHTMLElement,
  isTextNode,
} from "./filter"

interface WalkAndLabelResult {
  forceBlock: boolean
  isInlineNode: boolean
}

interface WalkAndLabelOptions {
  collectParagraphs?: boolean
  collectMutationRoots?: boolean
  dontWalkIntoElementsCache?: WeakSet<HTMLElement>
}

export interface WalkAndLabelScanResult extends WalkAndLabelResult {
  isolatedMutationRoots: HTMLElement[]
  paragraphs: HTMLElement[]
}

export function extractTextContent(node: TransNode, config: Config): string {
  if (isTextNode(node)) {
    const text = node.textContent ?? ""
    const trimmed = text.trim()
    if (trimmed === "")
      return " "
    const leadingWs = text.slice(0, text.length - text.trimStart().length)
    const trailingWs = text.slice(text.trimEnd().length)
    const hasLeading = /[^\S\n]/.test(leadingWs)
    const hasTrailing = /[^\S\n]/.test(trailingWs)
    return (hasLeading ? " " : "") + trimmed + (hasTrailing ? " " : "")
  }

  // Handle <br> elements as line breaks
  if (isHTMLElement(node) && node.tagName === "BR") {
    return "\n"
  }

  // We already don't walk and label the element which isDontWalkIntoElement
  // for the parent element we already walk and label, if we have a notranslate element inside this parent element,
  // we should extract the text content of the parent.
  // see this issue: https://github.com/endercat-alu/readfrog-local/issues/249
  // if (isDontWalkIntoButTranslateAsChildElement(node)) {
  //   return ''
  // }

  if (isDontWalkIntoAndDontTranslateAsChildElement(node, config)) {
    return ""
  }

  const childNodes = Array.from(node.childNodes)
  return childNodes.reduce((text: string, child: Node): string => {
    // TODO: support SVGElement in the future
    if (isTextNode(child) || isHTMLElement(child)) {
      return text + extractTextContent(child, config)
    }
    return text
  }, "")
}

export function walkAndLabelElement(
  element: HTMLElement,
  walkId: string,
  config: Config,
): WalkAndLabelResult
export function walkAndLabelElement(
  element: HTMLElement,
  walkId: string,
  config: Config,
  options: WalkAndLabelOptions & { collectParagraphs: true, collectMutationRoots: true },
): WalkAndLabelScanResult
export function walkAndLabelElement(
  element: HTMLElement,
  walkId: string,
  config: Config,
  options: WalkAndLabelOptions = {},
): WalkAndLabelResult | WalkAndLabelScanResult {
  const paragraphs: HTMLElement[] = []
  const isolatedMutationRoots: HTMLElement[] = []
  const ignoredElements = new WeakSet<HTMLElement>()
  const computedResults = new WeakMap<HTMLElement, WalkAndLabelResult>()
  const stack: Array<{ element: HTMLElement, exiting: boolean }> = [{ element, exiting: false }]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current)
      continue

    const { element: currentElement, exiting } = current

    if (!exiting) {
      const isDontWalkInto = isDontWalkIntoButTranslateAsChildElement(currentElement)
      if (isDontWalkInto) {
        options.dontWalkIntoElementsCache?.add(currentElement)
      }

      if (isDontWalkInto || isDontWalkIntoAndDontTranslateAsChildElement(currentElement, config)) {
        ignoredElements.add(currentElement)
        computedResults.set(currentElement, { forceBlock: false, isInlineNode: false })
        continue
      }

      currentElement.setAttribute(WALKED_ATTRIBUTE, walkId)
      stack.push({ element: currentElement, exiting: true })

      if (currentElement.shadowRoot) {
        if (options.collectMutationRoots) {
          for (const child of currentElement.shadowRoot.children) {
            if (isHTMLElement(child)) {
              isolatedMutationRoots.push(child)
            }
          }
        }

        for (let i = currentElement.shadowRoot.children.length - 1; i >= 0; i--) {
          const child = currentElement.shadowRoot.children[i]
          if (isHTMLElement(child)) {
            stack.push({ element: child, exiting: false })
          }
        }
      }

      for (let i = currentElement.childNodes.length - 1; i >= 0; i--) {
        const child = currentElement.childNodes[i]
        if (isHTMLElement(child)) {
          stack.push({ element: child, exiting: false })
        }
      }

      continue
    }

    let hasInlineNodeChild = false
    let forceBlock = false

    for (const child of currentElement.childNodes) {
      if (isTextNode(child)) {
        if (child.textContent?.trim()) {
          hasInlineNodeChild = true
        }
        continue
      }

      if (!isHTMLElement(child) || ignoredElements.has(child)) {
        continue
      }

      const childResult = computedResults.get(child)
      if (!childResult) {
        continue
      }

      forceBlock = forceBlock || childResult.forceBlock
      if (childResult.isInlineNode) {
        hasInlineNodeChild = true
      }
    }

    if (hasInlineNodeChild) {
      currentElement.setAttribute(PARAGRAPH_ATTRIBUTE, "")
      if (options.collectParagraphs) {
        paragraphs.push(currentElement)
      }
    }

    forceBlock = forceBlock || FORCE_BLOCK_TAGS.has(currentElement.tagName)

    if (currentElement.textContent?.trim() === "" && !forceBlock) {
      computedResults.set(currentElement, {
        forceBlock: false,
        isInlineNode: false,
      })
      continue
    }

    const isInlineNode = isShallowInlineHTMLElement(currentElement)
    const shouldForceBlock = forceBlock || isCustomForceBlockTranslation(currentElement)

    if (shouldForceBlock || (!isInlineNode && isShallowBlockHTMLElement(currentElement))) {
      currentElement.setAttribute(BLOCK_ATTRIBUTE, "")
    }
    else if (isInlineNode) {
      currentElement.setAttribute(INLINE_ATTRIBUTE, "")
    }

    computedResults.set(currentElement, {
      forceBlock,
      isInlineNode,
    })
  }

  const result = computedResults.get(element) ?? {
    forceBlock: false,
    isInlineNode: false,
  }

  if (!options.collectParagraphs && !options.collectMutationRoots) {
    return result
  }

  return {
    ...result,
    isolatedMutationRoots,
    paragraphs,
  }
}
