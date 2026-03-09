// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { CONTENT_WRAPPER_CLASS, TRANSLATION_MODE_ATTRIBUTE, WALKED_ATTRIBUTE } from "@/utils/constants/dom-labels"
import { flushBatchedOperations } from "../../dom/batch-dom"
import { originalContentMap } from "../core/translation-state"
import { removeAllTranslatedWrapperNodes } from "./translation-cleanup"

function createWrapper(walkId: string, mode: "bilingual" | "translationOnly" = "bilingual"): HTMLElement {
  const wrapper = document.createElement("span")
  wrapper.className = CONTENT_WRAPPER_CLASS
  wrapper.setAttribute(WALKED_ATTRIBUTE, walkId)
  wrapper.setAttribute(TRANSLATION_MODE_ATTRIBUTE, mode)
  wrapper.textContent = `${walkId}-${mode}`
  return wrapper
}

describe("translation cleanup", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    originalContentMap.clear()
  })

  it("should only remove wrappers for the requested walkId", async () => {
    const oldHost = document.createElement("div")
    const newHost = document.createElement("div")
    const oldWrapper = createWrapper("old")
    const newWrapper = createWrapper("new")

    oldHost.appendChild(oldWrapper)
    newHost.appendChild(newWrapper)
    document.body.append(oldHost, newHost)

    await removeAllTranslatedWrapperNodes(document, { walkId: "old" })
    flushBatchedOperations()

    expect(oldHost.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).toBeNull()
    expect(newHost.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).toBe(newWrapper)
  })

  it("should restore translation-only content while keeping newer wrappers", async () => {
    const restoreHost = document.createElement("div")
    const keepHost = document.createElement("div")
    const oldWrapper = createWrapper("old", "translationOnly")
    const newWrapper = createWrapper("new", "translationOnly")

    restoreHost.appendChild(oldWrapper)
    keepHost.appendChild(newWrapper)
    originalContentMap.set(restoreHost, "<p>restored old content</p>")
    originalContentMap.set(keepHost, "<p>restored new content</p>")
    document.body.append(restoreHost, keepHost)

    await removeAllTranslatedWrapperNodes(document, { walkId: "old" })
    flushBatchedOperations()

    expect(restoreHost.innerHTML).toBe("<p>restored old content</p>")
    expect(keepHost.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).toBe(newWrapper)
    expect(originalContentMap.has(restoreHost)).toBe(false)
    expect(originalContentMap.has(keepHost)).toBe(true)
  })
})
