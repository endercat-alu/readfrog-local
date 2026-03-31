import type { NodeIgnoreHeuristicRule } from "@/types/config/translate"
import { i18n } from "#imports"
import { useAtom } from "jotai"
import { Checkbox } from "@/components/ui/base-ui/checkbox"
import { Label } from "@/components/ui/base-ui/label"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { NODE_IGNORE_HEURISTIC_RULESET_VERSION } from "@/utils/constants/config"
import { getEnabledNodeIgnoreHeuristicRulesFromConfig } from "@/utils/host/translate/node-ignore-heuristics"
import { ConfigCard } from "../../components/config-card"

const RULE_ITEMS: NodeIgnoreHeuristicRule[] = [
  "semanticTags",
  "linkTextTail",
  "shortFileLink",
  "hashLikeOrFileName",
  "usernameLike",
  "repoOrPathLike",
  "versionLike",
  "numericLike",
  "fileSizeLike",
]

export function NodeIgnoreHeuristics() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const { nodeIgnoreHeuristics } = translateConfig.page
  const enabledRules = getEnabledNodeIgnoreHeuristicRulesFromConfig(nodeIgnoreHeuristics)

  const toggleRule = (rule: NodeIgnoreHeuristicRule, checked: boolean) => {
    const nextEnabledRules = checked
      ? Array.from(new Set([...enabledRules, rule]))
      : enabledRules.filter(item => item !== rule)

    void setTranslateConfig({
      ...translateConfig,
      page: {
        ...translateConfig.page,
        nodeIgnoreHeuristics: {
          ...nodeIgnoreHeuristics,
          rulesetVersion: NODE_IGNORE_HEURISTIC_RULESET_VERSION,
          enabledRules: nextEnabledRules,
        },
      },
    })
  }

  return (
    <ConfigCard
      id="node-ignore-heuristics"
      title={i18n.t("options.translation.nodeIgnoreHeuristics.title")}
      description={i18n.t("options.translation.nodeIgnoreHeuristics.description")}
    >
      <div className="flex flex-col gap-3">
        {RULE_ITEMS.map(rule => (
          <Label
            key={rule}
            htmlFor={`node-ignore-heuristics-${rule}`}
            className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
          >
            <Checkbox
              id={`node-ignore-heuristics-${rule}`}
              checked={enabledRules.includes(rule)}
              onCheckedChange={checked => toggleRule(rule, checked)}
            />
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {i18n.t(`options.translation.nodeIgnoreHeuristics.rules.${rule}.title`)}
              </div>
              <div className="text-sm text-muted-foreground">
                {i18n.t(`options.translation.nodeIgnoreHeuristics.rules.${rule}.description`)}
              </div>
            </div>
          </Label>
        ))}
      </div>
    </ConfigCard>
  )
}
