import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { NodeIgnoreHeuristicRule, PageRule, PageRuleAction, PageRuleCondition, PageRuleConditionField, PageRuleGroup, PageRuleNode, RuleLogicalOperator } from "@/types/config/translate"
import { i18n } from "#imports"
import { LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME } from "@read-frog/definitions"
import { useAtom } from "jotai"
import { useMemo } from "react"
import { LanguageCombobox } from "@/components/language-combobox"
import { SortableList } from "@/components/sortable-list"
import { Button } from "@/components/ui/base-ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/base-ui/card"
import { Input } from "@/components/ui/base-ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/base-ui/select"
import { Switch } from "@/components/ui/base-ui/switch"
import { NODE_IGNORE_HEURISTIC_RULES, PAGE_RULE_CONDITION_FIELDS, type RuleLanguageDetectionMode } from "@/types/config/translate"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { createRuleGroup } from "@/utils/host/translate/page-rules"
import { cn } from "@/utils/styles/utils"
import { Icon } from "../../../../components/icon"
import { ConfigCard } from "../../components/config-card"
import { PageLayout } from "../../components/page-layout"

const CONDITION_FIELDS: PageRuleConditionField[] = [...PAGE_RULE_CONDITION_FIELDS]

export function RulesPage() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const rules = translateConfig.page.rules

  const setRules = (nextRules: PageRule[]) => {
    void setTranslateConfig({
      page: {
        ...translateConfig.page,
        rules: nextRules,
      },
    })
  }

  const addRule = () => {
    setRules([...rules, createEmptyRule()])
  }

  return (
    <PageLayout title={i18n.t("options.pageRules.title")} className="pb-6">
      <ConfigCard
        id="page-rules"
        title={i18n.t("options.pageRules.title")}
        description={i18n.t("options.pageRules.description")}
        className="border-b"
      >
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            {i18n.t("options.pageRules.firstMatchDescription")}
          </div>
          <div className="flex justify-end">
            <Button onClick={addRule}>
              <Icon icon="tabler:plus" />
              {i18n.t("options.pageRules.addRule")}
            </Button>
          </div>
        </div>
      </ConfigCard>

      <div className="py-6">
        {rules.length === 0
          ? (
              <Card>
                <CardHeader>
                  <CardTitle>{i18n.t("options.pageRules.empty.title")}</CardTitle>
                  <CardDescription>{i18n.t("options.pageRules.empty.description")}</CardDescription>
                </CardHeader>
              </Card>
            )
          : (
              <SortableList
                list={rules}
                setList={setRules}
                className="flex flex-col gap-4"
                renderItem={rule => (
                  <RuleCard
                    rule={rule}
                    onChange={(nextRule) => {
                      setRules(rules.map(item => item.id === nextRule.id ? nextRule : item))
                    }}
                    onDelete={() => {
                      setRules(rules.filter(item => item.id !== rule.id))
                    }}
                  />
                )}
              />
            )}
      </div>
    </PageLayout>
  )
}

function RuleCard({
  rule,
  onChange,
  onDelete,
}: {
  rule: PageRule
  onChange: (rule: PageRule) => void
  onDelete: () => void
}) {
  const summary = useMemo(() => summarizeRule(rule), [rule])

  return (
    <Card className="overflow-visible">
      <CardHeader className="border-b">
        <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            value={rule.name}
            onChange={e => onChange({ ...rule, name: e.target.value })}
            placeholder={i18n.t("options.pageRules.namePlaceholder")}
            className="w-full md:max-w-sm"
          />
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              onCheckedChange={checked => onChange({ ...rule, enabled: checked })}
            />
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Icon icon="tabler:trash" className="size-4" />
            </Button>
          </div>
        </CardTitle>
        <CardDescription className="break-all">
          {summary}
        </CardDescription>
        <CardAction className="hidden md:flex md:items-center md:gap-2">
          <Icon icon="tabler:grip-vertical" className="text-muted-foreground size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-4">
        <section className="flex flex-col gap-3">
          <div className="text-sm font-medium">{i18n.t("options.pageRules.matchSectionTitle")}</div>
          <RuleGroupEditor
            group={rule.when}
            isRoot
            onChange={when => onChange({ ...rule, when })}
            action={rule.action}
          />
        </section>
        <section className="flex flex-col gap-3">
          <div className="text-sm font-medium">{i18n.t("options.pageRules.actionSectionTitle")}</div>
          <RuleActionEditor
            action={rule.action}
            onChange={(action) => onChange({
              ...rule,
              action,
              when: normalizeGroupForAction(rule.when, action),
            })}
          />
        </section>
      </CardContent>
    </Card>
  )
}

function RuleActionEditor({
  action,
  onChange,
}: {
  action: PageRuleAction
  onChange: (action: PageRuleAction) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground">{i18n.t("options.pageRules.actionTypeLabel")}</div>
        <Select
          value={action.type}
          onValueChange={(value) => {
            const nextType = value as PageRuleAction["type"]
            onChange({
              type: nextType,
              scope: nextType === "translate" ? "page" : action.scope,
            })
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="translate">{i18n.t("options.pageRules.actionTypes.translate")}</SelectItem>
            <SelectItem value="skip">{i18n.t("options.pageRules.actionTypes.skip")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground">{i18n.t("options.pageRules.actionScopeLabel")}</div>
        <Select
          value={action.scope}
          onValueChange={value => onChange({ ...action, scope: value as PageRuleAction["scope"] })}
          disabled={action.type === "translate"}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="page">{i18n.t("options.pageRules.actionScopes.page")}</SelectItem>
            {action.type === "skip" && (
              <SelectItem value="paragraph">{i18n.t("options.pageRules.actionScopes.paragraph")}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function RuleGroupEditor({
  group,
  onChange,
  isRoot = false,
  onDelete,
  action,
}: {
  group: PageRuleGroup
  onChange: (group: PageRuleGroup) => void
  isRoot?: boolean
  onDelete?: () => void
  action: PageRuleAction
}) {
  return (
    <div className={cn("rounded-lg border bg-muted/20 p-3", !isRoot && "ml-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={group.operator}
          onValueChange={value => onChange({ ...group, operator: value as RuleLogicalOperator })}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">AND</SelectItem>
            <SelectItem value="or">OR</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...group, items: [...group.items, createEmptyCondition(action)] })}
        >
          <Icon icon="tabler:plus" />
          {i18n.t("options.pageRules.addCondition")}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...group, items: [...group.items, createRuleGroup([createEmptyCondition(action)])] })}
        >
          <Icon icon="tabler:brackets" />
          {i18n.t("options.pageRules.addGroup")}
        </Button>

        {!isRoot && (
          <Button variant="ghost" size="icon-sm" onClick={onDelete}>
            <Icon icon="tabler:trash" className="size-4" />
          </Button>
        )}
      </div>

      {group.items.length === 0
        ? (
            <div className="pt-3 text-sm text-muted-foreground">
              {i18n.t("options.pageRules.emptyGroup")}
            </div>
          )
        : (
            <div className="mt-3 flex flex-col gap-3">
              {group.items.map((item) => {
                if (item.kind === "condition") {
                  return (
                    <RuleConditionEditor
                      key={item.id}
                      condition={item}
                      action={action}
                      onChange={condition => onChange({ ...group, items: replaceNode(group.items, condition.id, condition) })}
                      onDelete={() => onChange({ ...group, items: removeNode(group.items, item.id) })}
                    />
                  )
                }

                return (
                  <RuleGroupEditor
                    key={item.id}
                    group={item}
                    action={action}
                    onChange={nextGroup => onChange({ ...group, items: replaceNode(group.items, nextGroup.id, nextGroup) })}
                    onDelete={() => onChange({ ...group, items: removeNode(group.items, item.id) })}
                  />
                )
              })}
            </div>
          )}
    </div>
  )
}

function RuleConditionEditor({
  condition,
  action,
  onChange,
  onDelete,
}: {
  condition: PageRuleCondition
  action: PageRuleAction
  onChange: (condition: PageRuleCondition) => void
  onDelete: () => void
}) {
  const availableFields = action.scope === "page"
    ? CONDITION_FIELDS.filter(field => ["host", "path", "url", "pageLanguage"].includes(field))
    : CONDITION_FIELDS

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
        <Select
          value={condition.field}
          onValueChange={(value) => onChange(createConditionByField(value as PageRuleConditionField, condition.id))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableFields.map(field => (
              <SelectItem key={field} value={field}>
                {i18n.t(`options.pageRules.fields.${field}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ConditionValueEditor condition={condition} onChange={onChange} />

        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Icon icon="tabler:trash" className="size-4" />
        </Button>
      </div>

      {isLanguageCondition(condition) && (
        <div className="mt-3 md:max-w-[180px]">
          <Select
            value={condition.detectionMode}
            onValueChange={value => onChange({ ...condition, detectionMode: value as RuleLanguageDetectionMode })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">{i18n.t("options.pageRules.detectionModes.basic")}</SelectItem>
              <SelectItem value="llm">{i18n.t("options.pageRules.detectionModes.llm")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

function ConditionValueEditor({
  condition,
  onChange,
}: {
  condition: PageRuleCondition
  onChange: (condition: PageRuleCondition) => void
}) {
  if (condition.field === "host" || condition.field === "path" || condition.field === "url") {
    return (
      <Input
        value={condition.value}
        onChange={(e) => {
          onChange({
            ...condition,
            value: normalizeStringConditionValue(condition.field, e.target.value),
          })
        }}
        placeholder={i18n.t(`options.pageRules.placeholders.${condition.field}` as never)}
      />
    )
  }

  if (condition.field === "textLengthLessThan" || condition.field === "wordCountLessThan") {
    return (
      <Input
        type="number"
        min={1}
        value={condition.value}
        onChange={(e) => {
          const value = Number.parseInt(e.target.value, 10)
          onChange({ ...condition, value: Number.isFinite(value) && value > 0 ? value : 1 })
        }}
        placeholder={i18n.t(`options.pageRules.placeholders.${condition.field}` as never)}
      />
    )
  }

  if (condition.field === "heuristic") {
    return (
      <Select
        value={condition.value}
        onValueChange={value => onChange({ ...condition, value: value as NodeIgnoreHeuristicRule })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NODE_IGNORE_HEURISTIC_RULES.map(rule => (
            <SelectItem key={rule} value={rule}>
              {i18n.t(`options.translation.nodeIgnoreHeuristics.rules.${rule}.title` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <LanguageCombobox
      value={condition.value}
      onValueChange={value => onChange({ ...condition, value: value as LangCodeISO6393 })}
      placeholder={i18n.t("options.pageRules.placeholders.language")}
      className="w-full"
    />
  )
}

function createEmptyRule(): PageRule {
  return {
    id: crypto.randomUUID(),
    name: i18n.t("options.pageRules.defaultRuleName"),
    enabled: true,
    when: createRuleGroup([createEmptyCondition({ type: "translate", scope: "page" })]),
    action: {
      type: "translate",
      scope: "page",
    },
  }
}

function createEmptyCondition(action: PageRuleAction): PageRuleCondition {
  if (action.scope === "paragraph") {
    return createConditionByField("paragraphLanguage")
  }

  return createConditionByField("host")
}

function createConditionByField(field: PageRuleConditionField, id: string = crypto.randomUUID()): PageRuleCondition {
  switch (field) {
    case "host":
      return { kind: "condition", id, field, value: getDefaultStringConditionValue(field) }
    case "path":
      return { kind: "condition", id, field, value: getDefaultStringConditionValue(field) }
    case "url":
      return { kind: "condition", id, field, value: getDefaultStringConditionValue(field) }
    case "pageLanguage":
    case "paragraphLanguage":
      return { kind: "condition", id, field, value: "eng", detectionMode: "basic" }
    case "textLengthLessThan":
      return { kind: "condition", id, field, value: 10 }
    case "wordCountLessThan":
      return { kind: "condition", id, field, value: 5 }
    case "heuristic":
      return { kind: "condition", id, field, value: "semanticTags" }
  }
}

function getDefaultStringConditionValue(field: Extract<PageRuleConditionField, "host" | "path" | "url">): string {
  switch (field) {
    case "host":
      return "example.com"
    case "path":
      return "/*"
    case "url":
      return "https://*"
  }
}

function normalizeStringConditionValue(field: Extract<PageRuleConditionField, "host" | "path" | "url">, value: string): string {
  return value.trim() ? value : getDefaultStringConditionValue(field)
}

function removeNode(nodes: PageRuleNode[], nodeId: string): PageRuleNode[] {
  return nodes
    .filter(node => node.id !== nodeId)
    .map((node) => {
      if (node.kind === "group") {
        return {
          ...node,
          items: removeNode(node.items, nodeId),
        }
      }
      return node
    })
}

function replaceNode(nodes: PageRuleNode[], nodeId: string, nextNode: PageRuleNode): PageRuleNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return nextNode
    }

    if (node.kind === "group") {
      return {
        ...node,
        items: replaceNode(node.items, nodeId, nextNode),
      }
    }

    return node
  })
}

function summarizeRule(rule: PageRule): string {
  const ruleName = rule.name.trim() || i18n.t("options.pageRules.unnamedRule")
  return `${ruleName}: ${summarizeNode(rule.when)} -> ${summarizeAction(rule.action)}`
}

function summarizeNode(node: PageRuleNode): string {
  if (node.kind === "condition") {
    return summarizeCondition(node)
  }

  if (node.items.length === 0) {
    return i18n.t("options.pageRules.emptyGroup")
  }

  return `(${node.items.map(item => summarizeNode(item)).join(` ${node.operator.toUpperCase()} `)})`
}

function summarizeCondition(condition: PageRuleCondition): string {
  if (condition.field === "pageLanguage" || condition.field === "paragraphLanguage") {
    return `${i18n.t(`options.pageRules.fields.${condition.field}` as never)} ${formatLanguage(condition.value)}`
  }

  if (condition.field === "heuristic") {
    return `${i18n.t("options.pageRules.fields.heuristic")} ${i18n.t(`options.translation.nodeIgnoreHeuristics.rules.${condition.value}.title` as never)}`
  }

  if (condition.field === "textLengthLessThan" || condition.field === "wordCountLessThan") {
    return `${i18n.t(`options.pageRules.fields.${condition.field}` as never)} ${condition.value}`
  }

  return `${i18n.t(`options.pageRules.fields.${condition.field}` as never)} ${condition.value || i18n.t("options.pageRules.emptyValue")}`
}

function summarizeAction(action: PageRuleAction): string {
  return `${i18n.t(`options.pageRules.actionTypes.${action.type}` as never)} ${i18n.t(`options.pageRules.actionScopes.${action.scope}` as never)}`
}

function formatLanguage(code: LangCodeISO6393): string {
  return `${LANG_CODE_TO_EN_NAME[code]} (${LANG_CODE_TO_LOCALE_NAME[code]})`
}

function isLanguageCondition(condition: PageRuleCondition): condition is Extract<PageRuleCondition, { field: "pageLanguage" | "paragraphLanguage" }> {
  return condition.field === "pageLanguage" || condition.field === "paragraphLanguage"
}

function normalizeGroupForAction(group: PageRuleGroup, action: PageRuleAction): PageRuleGroup {
  return {
    ...group,
    items: group.items.map((item) => {
      if (item.kind === "group") {
        return normalizeGroupForAction(item, action)
      }

      if (action.scope === "page" && !["host", "path", "url", "pageLanguage"].includes(item.field)) {
        return createConditionByField("host", item.id)
      }

      return item
    }),
  }
}
