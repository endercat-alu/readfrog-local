import type { SelectionToolbarAction } from "@/types/config/overlay-tools"
import { i18n } from "#imports"
import { IconGripVertical } from "@tabler/icons-react"
import { useAtom } from "jotai"
import { SortableList } from "@/components/sortable-list"
import { Checkbox } from "@/components/ui/base-ui/checkbox"
import { Label } from "@/components/ui/base-ui/label"
import { Slider } from "@/components/ui/base-ui/slider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { ConfigCard } from "../../components/config-card"

const ALL_ACTIONS: SelectionToolbarAction[] = [
  "vocabularyInsight",
  "translate",
  "speak",
  "customFeatures",
]

type ActionItem = {
  id: SelectionToolbarAction
  enabled: boolean
}

function getActionLabel(action: SelectionToolbarAction) {
  return i18n.t(`options.floatingButtonAndToolbar.selectionToolbar.appearance.actions.${action}`)
}

export function SelectionToolbarAppearance() {
  const [selectionToolbar, setSelectionToolbar] = useAtom(configFieldsAtomMap.selectionToolbar)
  const appearance = selectionToolbar.appearance

  const updateAppearance = (patch: Partial<typeof appearance>) => {
    void setSelectionToolbar({
      ...selectionToolbar,
      appearance: {
        ...appearance,
        ...patch,
      },
    })
  }

  const orderedActionItems: ActionItem[] = [
    ...appearance.buttonOrder.map(action => ({ id: action, enabled: true })),
    ...ALL_ACTIONS
      .filter(action => !appearance.buttonOrder.includes(action))
      .map(action => ({ id: action, enabled: false })),
  ]

  const updateEnabledActions = (items: ActionItem[]) => {
    updateAppearance({
      buttonOrder: items.filter(item => item.enabled).map(item => item.id),
    })
  }

  return (
    <ConfigCard
      id="selection-toolbar-appearance"
      title={i18n.t("options.floatingButtonAndToolbar.selectionToolbar.appearance.title")}
      description={i18n.t("options.floatingButtonAndToolbar.selectionToolbar.appearance.description")}
    >
      <div className="space-y-6">
        <Label htmlFor="selection-toolbar-show-close" className="cursor-pointer">
          <Checkbox
            id="selection-toolbar-show-close"
            checked={appearance.showCloseButton}
            onCheckedChange={checked => updateAppearance({ showCloseButton: checked })}
          />
          {i18n.t("options.floatingButtonAndToolbar.selectionToolbar.appearance.showCloseButton")}
        </Label>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{i18n.t("options.floatingButtonAndToolbar.selectionToolbar.appearance.buttonSize")}</span>
            <span>{appearance.buttonSize}px</span>
          </div>
          <Slider
            min={24}
            max={40}
            step={2}
            value={appearance.buttonSize}
            onValueChange={value => updateAppearance({ buttonSize: Number(value) })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{i18n.t("options.floatingButtonAndToolbar.selectionToolbar.appearance.maxWidth")}</span>
            <span>{appearance.maxWidth}px</span>
          </div>
          <Slider
            min={160}
            max={960}
            step={20}
            value={appearance.maxWidth}
            onValueChange={value => updateAppearance({ maxWidth: Number(value) })}
          />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">
            {i18n.t("options.floatingButtonAndToolbar.selectionToolbar.appearance.actionOrder")}
          </div>
          <SortableList
            list={orderedActionItems}
            setList={updateEnabledActions}
            className="space-y-2"
            renderItem={item => (
              <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-3">
                <IconGripVertical className="size-4 text-muted-foreground" />
                <Checkbox
                  checked={item.enabled}
                  onCheckedChange={(checked) => {
                    updateEnabledActions(
                      orderedActionItems.map(actionItem =>
                        actionItem.id === item.id
                          ? { ...actionItem, enabled: checked }
                          : actionItem,
                      ),
                    )
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
    </ConfigCard>
  )
}
