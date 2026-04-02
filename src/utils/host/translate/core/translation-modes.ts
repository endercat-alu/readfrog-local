import type { Config } from "@/types/config/config"
import type { TransNode } from "@/types/dom"
import {
  CONTENT_WRAPPER_CLASS,
  NOTRANSLATE_CLASS,
  TRANSLATION_MODE_ATTRIBUTE,
  TRANSLATION_MODE_VALUE,
  WALKED_ATTRIBUTE,
} from "../../../constants/dom-labels"
import { getDetectedCodeFromStorage } from "@/utils/config/languages"
import { resolveProviderConfig } from "@/utils/constants/feature-providers"
import { batchDOMOperation, flushBatchedOperations } from "../../dom/batch-dom"
import { isBlockTransNode, isHTMLElement, isTextNode, isTransNode } from "../../dom/filter"
import { unwrapDeepestOnlyHTMLChild } from "../../dom/find"
import { getOwnerDocument } from "../../dom/node"
import { extractTextContent } from "../../dom/traversal"
import { removeTranslatedWrapperWithRestore, shouldRestoreOriginalContentForWrapper } from "../dom/translation-cleanup"
import { syncFastTranslationIndicator, upsertTranslatedNodeIntoWrapper } from "../dom/translation-insertion"
import { applyCacheHitMetadata } from "../cache-hit-debug"
import { findPreviousTranslatedWrapperInside } from "../dom/translation-wrapper"
import { hasParagraphSkipRules, shouldSkipParagraphTranslationByRules } from "../page-rules"
import { setPageTranslationRuntimeConfig } from "../runtime-config"
import { setTranslationDirAndLang } from "../translation-attributes"
import { createSpinnerInside, getTranslatedTextAndRemoveSpinner } from "../ui/spinner"
import { MARK_ATTRIBUTES_REGEX, originalContentMap, translatingNodes } from "./translation-state"

function resolveFastTranslationIndicatorState(meta: { isFinal: boolean, source: "default" | "fast" }): "preview" | "final" | undefined {
  if (meta.source === "default") {
    return undefined
  }

  return meta.isFinal ? "final" : "preview"
}

export async function translateNodes(
  nodes: ChildNode[],
  walkId: string,
  toggle: boolean = false,
  config: Config,
  forceBlockTranslation: boolean = false,
  options?: {
    signal?: AbortSignal
  },
): Promise<void> {
  if (options?.signal?.aborted)
    return

  setPageTranslationRuntimeConfig(config)

  const translationMode = config.translate.mode
  if (translationMode === "translationOnly") {
    await translateNodeTranslationOnlyMode(nodes, walkId, config, toggle, options)
  }
  else if (translationMode === "bilingual") {
    await translateNodesBilingualMode(nodes, walkId, config, toggle, forceBlockTranslation, options)
  }
}

export async function translateNodesBilingualMode(
  nodes: ChildNode[],
  walkId: string,
  config: Config,
  toggle: boolean = false,
  forceBlockTranslation: boolean = false,
  options?: {
    signal?: AbortSignal
  },
): Promise<void> {
  if (options?.signal?.aborted)
    return

  const transNodes = nodes.filter(node => isTransNode(node))
  if (transNodes.length === 0) {
    return
  }
  try {
    // prevent duplicate translation
    if (transNodes.every(node => translatingNodes.has(node))) {
      return
    }
    transNodes.forEach(node => translatingNodes.add(node))

    const lastNode = transNodes[transNodes.length - 1]
    const targetNode
      = transNodes.length === 1 && isBlockTransNode(lastNode) && isHTMLElement(lastNode)
        ? await unwrapDeepestOnlyHTMLChild(lastNode)
        : lastNode

    const existedTranslatedWrapper = findPreviousTranslatedWrapperInside(targetNode, walkId)
    if (existedTranslatedWrapper) {
      removeTranslatedWrapperWithRestore(existedTranslatedWrapper)
      if (toggle) {
        return
      }
      else {
        flushBatchedOperations()
        nodes.forEach(node => translatingNodes.delete(node))
        return translateNodesBilingualMode(nodes, walkId, config, toggle)
      }
    }

    const textContent = transNodes.map(node => extractTextContent(node, config)).join("").trim()
    if (!textContent)
      return

    if (hasParagraphSkipRules(config)) {
      if (await shouldSkipParagraphTranslationByRules(textContent, window.location.href, config, resolveProviderConfig(config, "translate"), await getDetectedCodeFromStorage(), transNodes))
        return
    }

    if (options?.signal?.aborted)
      return

    const ownerDoc = getOwnerDocument(targetNode)
    const translatedWrapperNode = ownerDoc.createElement("span")
    translatedWrapperNode.className = `${NOTRANSLATE_CLASS} ${CONTENT_WRAPPER_CLASS}`
    translatedWrapperNode.setAttribute(TRANSLATION_MODE_ATTRIBUTE, TRANSLATION_MODE_VALUE.bilingual)
    translatedWrapperNode.setAttribute(WALKED_ATTRIBUTE, walkId)
    setTranslationDirAndLang(translatedWrapperNode, config)
    const spinner = createSpinnerInside(translatedWrapperNode)

    // Batch DOM insertion to reduce layout thrashing
    const insertOperation = () => {
      if (isTextNode(targetNode) || transNodes.length > 1) {
        targetNode.parentNode?.insertBefore(
          translatedWrapperNode,
          targetNode.nextSibling,
        )
      }
      else {
        targetNode.appendChild(translatedWrapperNode)
      }
    }
    batchDOMOperation(insertOperation)

    await getTranslatedTextAndRemoveSpinner(nodes, textContent, spinner, translatedWrapperNode, {
      signal: options?.signal,
      onResult: async (translatedResult, meta) => {
        const translatedText = translatedResult.translation === textContent ? "" : translatedResult.translation
        applyCacheHitMetadata(translatedWrapperNode, translatedResult.cacheHit)

        if (!translatedText) {
          if (meta.isFinal) {
            batchDOMOperation(() => translatedWrapperNode.remove())
          }
          return
        }

        await upsertTranslatedNodeIntoWrapper(
          translatedWrapperNode,
          targetNode,
          translatedText,
          config.translate.translationNodeStyle,
          forceBlockTranslation,
        )
        syncFastTranslationIndicator(translatedWrapperNode, resolveFastTranslationIndicatorState(meta))
      },
    })

    if (options?.signal?.aborted) {
      batchDOMOperation(() => translatedWrapperNode.remove())
      return
    }
  }
  finally {
    transNodes.forEach(node => translatingNodes.delete(node))
  }
}

export async function translateNodeTranslationOnlyMode(
  nodes: ChildNode[],
  walkId: string,
  config: Config,
  toggle: boolean = false,
  options?: {
    signal?: AbortSignal
  },
): Promise<void> {
  if (options?.signal?.aborted)
    return

  const isTransNodeAndNotTranslatedWrapper = (node: Node): node is TransNode => {
    if (isHTMLElement(node) && node.classList.contains(CONTENT_WRAPPER_CLASS))
      return false
    return isTransNode(node)
  }

  const outerTransNodes = nodes.filter(isTransNode)
  if (outerTransNodes.length === 0) {
    return
  }

  // snapshot the outer parent element, to prevent lose it if we go to deeper by unwrapDeepestOnlyHTMLChild
  // test case is:
  // <div data-testid="test-node">
  //   <span style={{ display: 'inline' }}>原文</span> // get the outer parent snapshot before go to inner element
  //   <br />
  //   <span style={{ display: 'inline' }}>原文</span>
  //   原文
  //   <br />
  //   <span style={{ display: 'inline' }}>原文</span>
  // </div>,
  // Only save originalContent when there's no existing translation wrapper
  // If wrapper exists, we're removing translation and should restore from saved content
  const outerParentElement = outerTransNodes[0].parentElement
  const hasExistingWrapper = outerParentElement?.querySelector(`.${CONTENT_WRAPPER_CLASS}`)
  if (outerParentElement && !originalContentMap.has(outerParentElement) && !hasExistingWrapper) {
    originalContentMap.set(outerParentElement, outerParentElement.innerHTML)
  }

  let transNodes: TransNode[] = []
  let allChildNodes: ChildNode[] = []
  if (outerTransNodes.length === 1 && isHTMLElement(outerTransNodes[0])) {
    const unwrappedHTMLChild = await unwrapDeepestOnlyHTMLChild(outerTransNodes[0])
    allChildNodes = Array.from(unwrappedHTMLChild.childNodes)
    transNodes = allChildNodes.filter(isTransNodeAndNotTranslatedWrapper)
  }
  else {
    transNodes = outerTransNodes
    allChildNodes = nodes
  }

  if (transNodes.length === 0) {
    return
  }

  try {
    if (nodes.every(node => translatingNodes.has(node))) {
      return
    }
    nodes.forEach(node => translatingNodes.add(node))

    const targetNode = transNodes[transNodes.length - 1]

    const parentNode = targetNode.parentElement
    if (!parentNode) {
      console.error("targetNode.parentElement is not HTMLElement", targetNode.parentElement)
      return
    }
    const existedTranslatedWrapper = findPreviousTranslatedWrapperInside(targetNode.parentElement, walkId)
    const existedTranslatedWrapperOutside = targetNode.parentElement.closest(`.${CONTENT_WRAPPER_CLASS}`)

    const finalTranslatedWrapper = existedTranslatedWrapperOutside ?? existedTranslatedWrapper
    if (finalTranslatedWrapper && isHTMLElement(finalTranslatedWrapper)) {
      removeTranslatedWrapperWithRestore(finalTranslatedWrapper, {
        restoreOriginalContent: shouldRestoreOriginalContentForWrapper(finalTranslatedWrapper),
      })
      if (toggle) {
        return
      }
      else {
        // Flush the batched removal before retrying. Otherwise the old wrapper is still
        // discoverable in this tick and we recurse into the same cleanup path again.
        flushBatchedOperations()
        nodes.forEach(node => translatingNodes.delete(node))
        return translateNodeTranslationOnlyMode(nodes, walkId, config, toggle)
      }
    }

    const innerTextContent = transNodes.map(node => extractTextContent(node, config)).join("")
    if (!innerTextContent.trim())
      return

    if (hasParagraphSkipRules(config)) {
      if (await shouldSkipParagraphTranslationByRules(innerTextContent, window.location.href, config, resolveProviderConfig(config, "translate"), await getDetectedCodeFromStorage(), transNodes))
        return
    }

    const cleanTextContent = (content: string): string => {
      if (!content)
        return content

      let cleanedContent = content.replace(MARK_ATTRIBUTES_REGEX, "")
      cleanedContent = cleanedContent.replace(/<!--[\s\S]*?-->/g, " ")

      return cleanedContent
    }

    // Only save originalContent when there's no existing translation wrapper
    const hasExistingWrapperInParent = parentNode.querySelector(`.${CONTENT_WRAPPER_CLASS}`)
    if (!originalContentMap.has(parentNode) && !hasExistingWrapperInParent) {
      originalContentMap.set(parentNode, parentNode.innerHTML)
    }

    const getStringFormatFromNode = (node: Element | Text) => {
      if (isTextNode(node)) {
        return node.textContent
      }
      return node.outerHTML
    }

    const textContent = cleanTextContent(transNodes.map(getStringFormatFromNode).join(""))
    if (!textContent)
      return

    if (options?.signal?.aborted)
      return

    const ownerDoc = getOwnerDocument(targetNode)
    const translatedWrapperNode = ownerDoc.createElement("span")
    translatedWrapperNode.className = `${NOTRANSLATE_CLASS} ${CONTENT_WRAPPER_CLASS}`
    translatedWrapperNode.setAttribute(TRANSLATION_MODE_ATTRIBUTE, TRANSLATION_MODE_VALUE.translationOnly)
    translatedWrapperNode.setAttribute(WALKED_ATTRIBUTE, walkId)
    translatedWrapperNode.style.display = "contents"
    setTranslationDirAndLang(translatedWrapperNode, config)
    const spinner = createSpinnerInside(translatedWrapperNode)

    // Batch DOM insertion to reduce layout thrashing
    const insertOperation = () => {
      if (isTextNode(targetNode) || transNodes.length > 1) {
        targetNode.parentNode?.insertBefore(
          translatedWrapperNode,
          targetNode.nextSibling,
        )
      }
      else {
        targetNode.appendChild(translatedWrapperNode)
      }
    }
    batchDOMOperation(insertOperation)

    let hasCommittedTranslation = false

    await getTranslatedTextAndRemoveSpinner(nodes, textContent, spinner, translatedWrapperNode, {
      signal: options?.signal,
      onResult: async (translatedResult, meta) => {
        const translatedText = translatedResult.translation

        if (!translatedText) {
          if (meta.isFinal) {
            if (hasCommittedTranslation) {
              removeTranslatedWrapperWithRestore(translatedWrapperNode)
            }
            else {
              batchDOMOperation(() => translatedWrapperNode.remove())
            }
          }
          return
        }

        translatedWrapperNode.innerHTML = translatedText
        applyCacheHitMetadata(translatedWrapperNode, translatedResult.cacheHit)
        syncFastTranslationIndicator(translatedWrapperNode, resolveFastTranslationIndicatorState(meta))

        if (hasCommittedTranslation) {
          return
        }

        hasCommittedTranslation = true
        batchDOMOperation(() => {
          const lastChildNode = allChildNodes[allChildNodes.length - 1]
          lastChildNode.parentNode?.insertBefore(translatedWrapperNode, lastChildNode.nextSibling)
          allChildNodes.forEach(childNode => childNode.remove())
        })
      },
    })

    if (options?.signal?.aborted) {
      batchDOMOperation(() => translatedWrapperNode.remove())
      return
    }
  }
  finally {
    nodes.forEach(node => translatingNodes.delete(node))
  }
}
