import type { Config } from "@/types/config/config"
import type { PageRule, PageRuleCondition } from "@/types/config/translate"
import { atom } from "jotai"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { createRuleGroup } from "@/utils/host/translate/page-rules"
import { getActiveTabUrl } from "@/utils/utils"

type TranslateConfig = Config["translate"]

// Sync atom to store the checked state
export const isCurrentSiteInPatternsAtom = atom<boolean>(false)

function findPopupAlwaysTranslateRuleIndex(rules: PageRule[], hostname: string): number {
  return rules.findIndex(rule =>
    rule.meta?.source === "popupAlwaysTranslate"
    && rule.meta.host === hostname
    && rule.action.type === "translate"
    && rule.action.scope === "page",
  )
}

function isAutoTranslateWebsitesRule(rule: PageRule): boolean {
  return rule.id === "rule-auto-translate-websites"
    && rule.action.type === "translate"
    && rule.action.scope === "page"
    && rule.when.operator === "or"
    && rule.when.items.every(item => item.kind === "condition" && item.field === "host")
}

function findAutoTranslateWebsitesRuleIndex(rules: PageRule[]): number {
  return rules.findIndex(isAutoTranslateWebsitesRule)
}

function findHostConditionIndex(rule: PageRule, hostname: string): number {
  if (!isAutoTranslateWebsitesRule(rule)) {
    return -1
  }

  return rule.when.items.findIndex(item => item.kind === "condition" && item.field === "host" && item.value === hostname)
}

export async function getIsInPatterns(translateConfig: TranslateConfig) {
  const activeTabUrl = await getActiveTabUrl()
  if (!activeTabUrl)
    return false

  const hostname = new URL(activeTabUrl).hostname
  const rules = translateConfig.page.rules

  return findPopupAlwaysTranslateRuleIndex(rules, hostname) !== -1
    || rules.some(rule => findHostConditionIndex(rule, hostname) !== -1)
}

// Async atom to initialize the checked state
export const initIsCurrentSiteInPatternsAtom = atom(
  null,
  async (get, set) => {
    const translateConfig = get(configFieldsAtomMap.translate)
    set(isCurrentSiteInPatternsAtom, await getIsInPatterns(translateConfig))
  },
)

// Atom to toggle current site in auto-translate patterns
export const toggleCurrentSiteAtom = atom(
  null,
  async (get, set, checked: boolean) => {
    const translateConfig = get(configFieldsAtomMap.translate)
    const activeTabUrl = await getActiveTabUrl()

    if (!activeTabUrl)
      return

    const hostname = new URL(activeTabUrl).hostname
    const currentRules = translateConfig.page.rules
    const popupRuleIndex = findPopupAlwaysTranslateRuleIndex(currentRules, hostname)
    const autoTranslateWebsitesRuleIndex = findAutoTranslateWebsitesRuleIndex(currentRules)

    if (checked) {
      const alreadyExists = popupRuleIndex !== -1
        || currentRules.some(rule => findHostConditionIndex(rule, hostname) !== -1)

      if (!alreadyExists) {
        if (autoTranslateWebsitesRuleIndex !== -1) {
          const targetRule = currentRules[autoTranslateWebsitesRuleIndex]
          const nextRule: PageRule = {
            ...targetRule,
            enabled: true,
            when: {
              ...targetRule.when,
              items: [
                ...targetRule.when.items,
                createHostCondition(hostname),
              ],
            },
          }

          void set(configFieldsAtomMap.translate, {
            page: {
              ...translateConfig.page,
              rules: currentRules.map((rule, index) => index === autoTranslateWebsitesRuleIndex ? nextRule : rule),
            },
          })
        }
        else {
          void set(configFieldsAtomMap.translate, {
            page: {
              ...translateConfig.page,
              rules: [createPopupAlwaysTranslateRule(hostname), ...currentRules],
            },
          })
        }
      }
    }
    else {
      const rulesWithoutPopupRule = currentRules.filter((_, index) => index !== popupRuleIndex)
      const nextRules = rulesWithoutPopupRule.map((rule, index) => {
        const adjustedIndex = index >= popupRuleIndex && popupRuleIndex !== -1 ? index + 1 : index
        if (adjustedIndex !== autoTranslateWebsitesRuleIndex || !isAutoTranslateWebsitesRule(rule)) {
          return rule
        }

        return {
          ...rule,
          when: {
            ...rule.when,
            items: rule.when.items.filter(item =>
              !(item.kind === "condition" && item.field === "host" && item.value === hostname),
            ),
          },
        }
      })

      void set(configFieldsAtomMap.translate, {
        page: {
          ...translateConfig.page,
          rules: nextRules,
        },
      })
    }

    set(isCurrentSiteInPatternsAtom, checked)
  },
)

export const isPageTranslatedAtom = atom<boolean>(false)

function createHostCondition(hostname: string): Extract<PageRuleCondition, { field: "host" }> {
  return {
    kind: "condition",
    id: crypto.randomUUID(),
    field: "host",
    value: hostname,
  }
}

function createPopupAlwaysTranslateRule(hostname: string): PageRule {
  return {
    id: crypto.randomUUID(),
    name: hostname,
    enabled: true,
    when: createRuleGroup([
      createHostCondition(hostname),
    ]),
    action: {
      type: "translate",
      scope: "page",
    },
    meta: {
      source: "popupAlwaysTranslate",
      host: hostname,
    },
  }
}
