import type { ContextMenuItem, ContextMenuTarget } from "@/types/config/overlay-tools"
import { i18n } from "#imports"
import { IconGripVertical } from "@tabler/icons-react"
import { useAtom } from "jotai"
import { SortableList } from "@/components/sortable-list"
import { Checkbox } from "@/components/ui/base-ui/checkbox"
import { Label } from "@/components/ui/base-ui/label"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { ConfigCard } from "../../components/config-card"

const CONTEXT_TARGETS: ContextMenuTarget[] = [
  "page",
  "selection",
  "link",
  "image",
  "editable",
]

const AVAILABLE_ACTIONS: Record<ContextMenuTarget, ContextMenuItem[]> = {
  page: ["togglePageTranslation", "openOptions"],
  selection: ["selectionTranslate", "selectionVocabularyInsight", "selectionDictionary", "translateSelectionInHub", "openOptions"],
  link: ["togglePageTranslation", "openOptions"],
  image: ["togglePageTranslation", "openOptions"],
  editable: ["togglePageTranslation", "openOptions"],
}

type ActionItem = {
  id: ContextMenuItem
  enabled: boolean
}

function getContextLabel(target: ContextMenuTarget) {
  return i18n.t(`options.floatingButtonAndToolbar.contextMenu.contexts.targets.${target}`)
}

function getActionLabel(action: ContextMenuItem) {
  return i18n.t(`options.floatingButtonAndToolbar.contextMenu.contexts.actions.${action}`)
}

export function ContextMenuContexts() {
  const [contextMenu, setContextMenu] = useAtom(configFieldsAtomMap.contextMenu)

  const updateContext = (
    target: ContextMenuTarget,
    patch: Partial<typeof contextMenu.contexts.page>,
  ) => {
    void setContextMenu({
      ...contextMenu,
      contexts: {
        ...contextMenu.contexts,
        [target]: {
          ...contextMenu.contexts[target],
          ...patch,
        },
      },
    })
  }

  return (
    <ConfigCard
      id="context-menu-contexts"
      title={i18n.t("options.floatingButtonAndToolbar.contextMenu.contexts.title")}
      description={i18n.t("options.floatingButtonAndToolbar.contextMenu.contexts.description")}
    >
      <div className="space-y-4">
        {CONTEXT_TARGETS.map((target) => {
          const targetConfig = contextMenu.contexts[target]
          const orderedItems: ActionItem[] = [
            ...targetConfig.items.map(item => ({ id: item, enabled: true })),
            ...AVAILABLE_ACTIONS[target]
              .filter(item => !targetConfig.items.includes(item))
              .map(item => ({ id: item, enabled: false })),
          ]

          return (
            <div key={target} className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{getContextLabel(target)}</div>
                  <div className="text-sm text-muted-foreground">
                    {i18n.t("options.floatingButtonAndToolbar.contextMenu.contexts.contextDescription")}
                  </div>
                </div>
                <Switch
                  checked={targetConfig.enabled}
                  onCheckedChange={checked => updateContext(target, { enabled: checked })}
                />
              </div>

              <Label htmlFor={`context-menu-${target}-collapsed`} className="cursor-pointer">
                <Checkbox
                  id={`context-menu-${target}-collapsed`}
                  checked={targetConfig.collapsed}
                  onCheckedChange={checked => updateContext(target, { collapsed: checked })}
                />
                {i18n.t("options.floatingButtonAndToolbar.contextMenu.contexts.collapsed")}
              </Label>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {i18n.t("options.floatingButtonAndToolbar.contextMenu.contexts.items")}
                </div>
                <SortableList
                  list={orderedItems}
                  setList={(items) => {
                    updateContext(target, {
                      items: items.filter(item => item.enabled).map(item => item.id),
                    })
                  }}
                  className="space-y-2"
                  renderItem={item => (
                    <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-3">
                      <IconGripVertical className="size-4 text-muted-foreground" />
                      <Checkbox
                        checked={item.enabled}
                        onCheckedChange={(checked) => {
                          updateContext(target, {
                            items: checked
                              ? [...targetConfig.items, item.id]
                              : targetConfig.items.filter(action => action !== item.id),
                          })
                        }}
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        {getActionLabel(item.id)}
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>
          )
        })}
      </div>
    </ConfigCard>
  )
}
