import { CONTENT_WRAPPER_CLASS, REACT_SHADOW_HOST_CLASS, TRANSLATION_MODE_ATTRIBUTE, WALKED_ATTRIBUTE } from "../../../constants/dom-labels"
import { removeReactShadowHost } from "../../../react-shadow-host/create-shadow-host"
import { batchDOMOperation } from "../../dom/batch-dom"
import { isHTMLElement } from "../../dom/filter"
import { originalContentMap } from "../core/translation-state"

const CLEANUP_BATCH_SIZE = 25
const CLEANUP_TIME_SLICE_MS = 8

interface CleanupOptions {
  walkId?: string
  signal?: AbortSignal
}

export function removeShadowHostInTranslatedWrapper(wrapper: HTMLElement): void {
  // Remove React shadow hosts (for error components)
  const translationShadowHost = wrapper.querySelector(`.${REACT_SHADOW_HOST_CLASS}`)
  if (translationShadowHost && isHTMLElement(translationShadowHost)) {
    removeReactShadowHost(translationShadowHost)
  }

  // Remove lightweight spinners
  const spinner = wrapper.querySelector(".read-frog-spinner")
  if (spinner) {
    batchDOMOperation(() => spinner.remove())
  }
}

/**
 * Remove translated wrapper and restore original content based on translation mode
 * @param wrapper - The translated wrapper element to remove
 */
export function removeTranslatedWrapperWithRestore(wrapper: HTMLElement): void {
  removeShadowHostInTranslatedWrapper(wrapper)

  const translationMode = wrapper.getAttribute(TRANSLATION_MODE_ATTRIBUTE)

  if (translationMode === "translationOnly") {
    // For translation-only mode, find nearest ancestor in originalContentMap and restore
    let currentNode = wrapper.parentNode

    while (currentNode && isHTMLElement(currentNode)) {
      const originalContent = originalContentMap.get(currentNode)
      if (originalContent) {
        const nodeToRestore = currentNode
        batchDOMOperation(() => {
          nodeToRestore.innerHTML = originalContent
        })
        originalContentMap.delete(currentNode)
        return
      }
      currentNode = currentNode.parentNode
    }
  }

  // For bilingual mode or when no original content is found, just remove the wrapper
  batchDOMOperation(() => wrapper.remove())
}

function shouldCleanupWrapper(node: HTMLElement, walkId?: string): boolean {
  if (!node.classList.contains(CONTENT_WRAPPER_CLASS))
    return false

  return walkId === undefined || node.getAttribute(WALKED_ATTRIBUTE) === walkId
}

function collectTranslatedWrappers(root: Document | ShadowRoot, walkId?: string): HTMLElement[] {
  const translatedNodes: HTMLElement[] = []
  const seen = new Set<HTMLElement>()
  const ownerDocument = root instanceof Document ? root : root.ownerDocument

  const addWrapper = (node: Element) => {
    if (!isHTMLElement(node) || seen.has(node) || !shouldCleanupWrapper(node, walkId))
      return

    seen.add(node)
    translatedNodes.push(node)
  }

  const visitRoot = (currentRoot: Document | ShadowRoot) => {
    currentRoot.querySelectorAll(`.${CONTENT_WRAPPER_CLASS}`).forEach(addWrapper)

    const treeWalker = ownerDocument.createTreeWalker(
      currentRoot,
      NodeFilter.SHOW_ELEMENT,
    )

    let currentNode: Node | null = treeWalker.currentNode
    while (currentNode) {
      if (isHTMLElement(currentNode) && currentNode.shadowRoot) {
        visitRoot(currentNode.shadowRoot)
      }
      currentNode = treeWalker.nextNode()
    }
  }

  visitRoot(root)

  return translatedNodes
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve())
      return
    }

    setTimeout(resolve, 0)
  })
}

export async function removeAllTranslatedWrapperNodes(
  root: Document | ShadowRoot = document,
  options: CleanupOptions = {},
): Promise<void> {
  const translatedNodes = collectTranslatedWrappers(root, options.walkId)

  let index = 0
  while (index < translatedNodes.length) {
    if (options.signal?.aborted)
      return

    const deadline = performance.now() + CLEANUP_TIME_SLICE_MS
    let processedInBatch = 0

    while (index < translatedNodes.length && processedInBatch < CLEANUP_BATCH_SIZE) {
      if (options.signal?.aborted)
        return

      const contentWrapperNode = translatedNodes[index]
      removeTranslatedWrapperWithRestore(contentWrapperNode)
      index += 1
      processedInBatch += 1

      if (performance.now() >= deadline)
        break
    }

    if (index < translatedNodes.length) {
      await yieldToMainThread()
    }
  }
}
