import type { TranslationNodeStyleConfig } from "@/types/config/translate"
import type { TransNode } from "@/types/dom"
import {
  BLOCK_CONTENT_CLASS,
  FAST_TRANSLATION_INDICATOR_CLASS,
  FAST_TRANSLATION_INDICATOR_STATE_ATTRIBUTE,
  INLINE_CONTENT_CLASS,
  NOTRANSLATE_CLASS,
} from "../../../constants/dom-labels"
import { batchDOMOperation } from "../../dom/batch-dom"
import { isBlockTransNode, isCustomForceBlockTranslation, isHTMLElement, isInlineTransNode } from "../../dom/filter"
import { getOwnerDocument } from "../../dom/node"
import { decorateTranslationNode } from "../ui/decorate-translation"
import { isForceInlineTranslation } from "../ui/translation-utils"

type FastTranslationIndicatorState = "preview" | "final"

export function addInlineTranslation(ownerDoc: Document, translatedWrapperNode: HTMLElement, translatedNode: HTMLElement): void {
  const spaceNode = ownerDoc.createElement("span")
  spaceNode.textContent = "  "
  translatedWrapperNode.appendChild(spaceNode)
  translatedNode.className = `${NOTRANSLATE_CLASS} ${INLINE_CONTENT_CLASS}`
}

export function addBlockTranslation(ownerDoc: Document, translatedWrapperNode: HTMLElement, translatedNode: HTMLElement): void {
  const brNode = ownerDoc.createElement("br")
  translatedWrapperNode.appendChild(brNode)
  translatedNode.className = `${NOTRANSLATE_CLASS} ${BLOCK_CONTENT_CLASS}`
}

export async function insertTranslatedNodeIntoWrapper(
  translatedWrapperNode: HTMLElement,
  targetNode: TransNode,
  translatedText: string,
  translationNodeStyle: TranslationNodeStyleConfig,
  forceBlockTranslation: boolean = false,
): Promise<void> {
  // Use the wrapper's owner document
  const ownerDoc = getOwnerDocument(translatedWrapperNode)
  const translatedNode = ownerDoc.createElement("span")
  const forceInlineTranslation = isForceInlineTranslation(targetNode)
  const customForceBlock = isHTMLElement(targetNode) && isCustomForceBlockTranslation(targetNode)

  // priority: customForceBlock > forceInlineTranslation > forceBlockTranslation > isInlineTransNode > isBlockTransNode
  if (customForceBlock) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (forceInlineTranslation) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (forceBlockTranslation) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (isInlineTransNode(targetNode)) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (isBlockTransNode(targetNode)) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else {
    // not inline or block, maybe notranslate
    return
  }

  translatedNode.textContent = translatedText
  translatedWrapperNode.appendChild(translatedNode)
  await decorateTranslationNode(translatedNode, translationNodeStyle)
}

export async function upsertTranslatedNodeIntoWrapper(
  translatedWrapperNode: HTMLElement,
  targetNode: TransNode,
  translatedText: string,
  translationNodeStyle: TranslationNodeStyleConfig,
  forceBlockTranslation: boolean = false,
): Promise<void> {
  const existingTranslatedNode = translatedWrapperNode.querySelector<HTMLElement>(`.${INLINE_CONTENT_CLASS}, .${BLOCK_CONTENT_CLASS}`)
  if (existingTranslatedNode) {
    batchDOMOperation(() => {
      existingTranslatedNode.textContent = translatedText
    })
    return
  }

  await insertTranslatedNodeIntoWrapper(
    translatedWrapperNode,
    targetNode,
    translatedText,
    translationNodeStyle,
    forceBlockTranslation,
  )
}

export function syncFastTranslationIndicator(
  translatedWrapperNode: HTMLElement,
  state?: FastTranslationIndicatorState,
): void {
  const existingIndicator = translatedWrapperNode.querySelector<HTMLElement>(`.${FAST_TRANSLATION_INDICATOR_CLASS}`)

  if (!state) {
    existingIndicator?.remove()
    return
  }

  const ownerDoc = getOwnerDocument(translatedWrapperNode)
  const indicator = existingIndicator ?? ownerDoc.createElement("span")
  if (!existingIndicator) {
    indicator.className = `${NOTRANSLATE_CLASS} ${FAST_TRANSLATION_INDICATOR_CLASS}`
    indicator.setAttribute("aria-hidden", "true")
  }

  indicator.setAttribute(FAST_TRANSLATION_INDICATOR_STATE_ATTRIBUTE, state)

  const translatedNode = translatedWrapperNode.querySelector<HTMLElement>(`.${INLINE_CONTENT_CLASS}, .${BLOCK_CONTENT_CLASS}`)
  const anchorNode = translatedNode ?? translatedWrapperNode.firstChild
  if (!anchorNode) {
    translatedWrapperNode.appendChild(indicator)
    return
  }

  if (anchorNode !== indicator) {
    translatedWrapperNode.insertBefore(indicator, anchorNode)
  }
}
