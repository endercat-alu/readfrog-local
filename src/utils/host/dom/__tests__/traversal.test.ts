// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG, NODE_IGNORE_HEURISTIC_RULESET_VERSION } from "@/utils/constants/config"
import { extractTextContent, walkAndLabelElement } from "../traversal"

describe("extractTextContent", () => {
  describe("text node whitespace normalization", () => {
    it("should return trimmed text without spaces when only newlines are trimmed", () => {
      const textNode = document.createTextNode("\n\nHello\n\n")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe("Hello")
    })

    it("should add leading space when leading whitespace contains spaces", () => {
      const textNode = document.createTextNode("  Hello")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" Hello")
    })

    it("should add trailing space when trailing whitespace contains spaces", () => {
      const textNode = document.createTextNode("Hello  ")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe("Hello ")
    })

    it("should add both spaces when both sides have non-newline whitespace", () => {
      const textNode = document.createTextNode("  Hello  ")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" Hello ")
    })

    it("should add spaces when whitespace includes both newlines and spaces", () => {
      const textNode = document.createTextNode("\n  Hello  \n")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" Hello ")
    })

    it("should add leading space when leading has newline then space", () => {
      const textNode = document.createTextNode("\n Hello")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" Hello")
    })

    it("should add trailing space when trailing has space then newline", () => {
      const textNode = document.createTextNode("Hello \n")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe("Hello ")
    })

    it("should not add spaces for text without any whitespace", () => {
      const textNode = document.createTextNode("Hello")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe("Hello")
    })

    it("should return single space for whitespace-only text", () => {
      const textNode = document.createTextNode("   ")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" ")
    })

    it("should return single space for newline-only text", () => {
      const textNode = document.createTextNode("\n\n")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" ")
    })

    it("should return single space for empty text", () => {
      const textNode = document.createTextNode("")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" ")
    })

    it("should handle tabs as non-newline whitespace", () => {
      const textNode = document.createTextNode("\tHello\t")
      expect(extractTextContent(textNode, DEFAULT_CONFIG)).toBe(" Hello ")
    })
  })

  describe("br element handling", () => {
    it("should return newline for BR element", () => {
      const br = document.createElement("br")
      expect(extractTextContent(br, DEFAULT_CONFIG)).toBe("\n")
    })
  })

  describe("nested element extraction", () => {
    it("should extract text from nested elements", () => {
      const div = document.createElement("div")
      div.innerHTML = "Hello <span>World</span>"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("Hello World")
    })

    it("should handle BR in nested content", () => {
      const div = document.createElement("div")
      div.innerHTML = "Line1<br>Line2"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("Line1\nLine2")
    })

    it("should preserve spaces between inline elements", () => {
      const div = document.createElement("div")
      div.innerHTML = "<span>Hello</span> <span>World</span>"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("Hello World")
    })

    it("should include ruby text and exclude rp/rt elements", () => {
      const div = document.createElement("div")
      div.innerHTML = "Before<ruby>大阪<rp>(</rp><rt>Osaka</rt><rp>)</rp></ruby>After"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("Before大阪After")
    })

    it("should exclude semantic tag text when the heuristic is enabled", () => {
      const div = document.createElement("div")
      div.innerHTML = "Before<code>npm install</code>After"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("BeforeAfter")
    })

    it("should include semantic tag text when the heuristic is disabled", () => {
      const div = document.createElement("div")
      div.innerHTML = "Before<code>npm install</code>After"
      const config = {
        ...DEFAULT_CONFIG,
        translate: {
          ...DEFAULT_CONFIG.translate,
          page: {
            ...DEFAULT_CONFIG.translate.page,
            nodeIgnoreHeuristics: {
              rulesetVersion: NODE_IGNORE_HEURISTIC_RULESET_VERSION,
              enabledRules: DEFAULT_CONFIG.translate.page.nodeIgnoreHeuristics.enabledRules.filter(rule => rule !== "semanticTags"),
            },
          },
        },
      }
      expect(extractTextContent(div, config)).toBe("Beforenpm installAfter")
    })
  })

  describe("visually hidden element exclusion", () => {
    it("should exclude sr-only child element text", () => {
      const div = document.createElement("div")
      div.innerHTML = "Visible text<span class=\"sr-only\">Hidden text</span>"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("Visible text")
    })

    it("should exclude visually-hidden child element text", () => {
      const div = document.createElement("div")
      div.innerHTML = "Visible text<span class=\"visually-hidden\">Hidden text</span>"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("Visible text")
    })

    it("should exclude sr-only text mixed with visible siblings", () => {
      const div = document.createElement("div")
      div.innerHTML = "<span>Hello</span><span class=\"sr-only\">Secret</span> <span>World</span>"
      expect(extractTextContent(div, DEFAULT_CONFIG)).toBe("Hello World")
    })
  })
})

describe("walkAndLabelElement", () => {
  it("should collect only top-level paragraphs during scan", () => {
    document.body.innerHTML = `
      <section id="root">
        <div id="outer">
          <span id="inner">Hello</span>
        </div>
      </section>
    `

    const root = document.getElementById("root") as HTMLElement
    const result = walkAndLabelElement(root, "walk-id", DEFAULT_CONFIG, {
      collectParagraphs: true,
      collectMutationRoots: true,
    })

    expect(result.topLevelParagraphs.map(el => el.id)).toEqual(["outer"])
  })
})
