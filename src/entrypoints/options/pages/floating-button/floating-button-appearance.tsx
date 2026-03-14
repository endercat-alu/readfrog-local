import { i18n } from "#imports"
import { useAtom } from "jotai"
import { Checkbox } from "@/components/ui/base-ui/checkbox"
import { Label } from "@/components/ui/base-ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/base-ui/radio-group"
import { Slider } from "@/components/ui/base-ui/slider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { ConfigCard } from "../../components/config-card"

export function FloatingButtonAppearance() {
  const [floatingButton, setFloatingButton] = useAtom(configFieldsAtomMap.floatingButton)
  const appearance = floatingButton.appearance

  const updateAppearance = (patch: Partial<typeof appearance>) => {
    void setFloatingButton({
      ...floatingButton,
      appearance: {
        ...appearance,
        ...patch,
      },
    })
  }

  return (
    <ConfigCard
      id="floating-button-appearance"
      title={i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.title")}
      description={i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.description")}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.side")}
          </div>
          <RadioGroup
            value={appearance.side}
            onValueChange={value => updateAppearance({ side: value as typeof appearance.side })}
            className="flex flex-col gap-2"
          >
            <Label htmlFor="floating-button-side-right" className="cursor-pointer">
              <RadioGroupItem value="right" id="floating-button-side-right" />
              {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.sideRight")}
            </Label>
            <Label htmlFor="floating-button-side-left" className="cursor-pointer">
              <RadioGroupItem value="left" id="floating-button-side-left" />
              {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.sideLeft")}
            </Label>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">
            {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.expandMode")}
          </div>
          <RadioGroup
            value={appearance.expandMode}
            onValueChange={value => updateAppearance({ expandMode: value as typeof appearance.expandMode })}
            className="flex flex-col gap-2"
          >
            <Label htmlFor="floating-button-expand-hover" className="cursor-pointer">
              <RadioGroupItem value="hover" id="floating-button-expand-hover" />
              {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.expandOnHover")}
            </Label>
            <Label htmlFor="floating-button-expand-always" className="cursor-pointer">
              <RadioGroupItem value="always" id="floating-button-expand-always" />
              {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.alwaysExpanded")}
            </Label>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label htmlFor="floating-button-show-translate" className="cursor-pointer">
            <Checkbox
              id="floating-button-show-translate"
              checked={appearance.showQuickTranslateButton}
              onCheckedChange={checked => updateAppearance({ showQuickTranslateButton: checked })}
            />
            {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.showQuickTranslateButton")}
          </Label>
          <Label htmlFor="floating-button-show-settings" className="cursor-pointer">
            <Checkbox
              id="floating-button-show-settings"
              checked={appearance.showSettingsButton}
              onCheckedChange={checked => updateAppearance({ showSettingsButton: checked })}
            />
            {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.showSettingsButton")}
          </Label>
          <Label htmlFor="floating-button-show-close" className="cursor-pointer">
            <Checkbox
              id="floating-button-show-close"
              checked={appearance.showCloseButton}
              onCheckedChange={checked => updateAppearance({ showCloseButton: checked })}
            />
            {i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.showCloseButton")}
          </Label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.idleOpacity")}</span>
            <span>{Math.round(appearance.idleOpacity * 100)}%</span>
          </div>
          <Slider
            min={20}
            max={100}
            step={5}
            value={Math.round(appearance.idleOpacity * 100)}
            onValueChange={value => updateAppearance({ idleOpacity: Number(value) / 100 })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{i18n.t("options.floatingButtonAndToolbar.floatingButton.appearance.scale")}</span>
            <span>{appearance.scale.toFixed(2)}x</span>
          </div>
          <Slider
            min={80}
            max={140}
            step={5}
            value={Math.round(appearance.scale * 100)}
            onValueChange={value => updateAppearance({ scale: Number(value) / 100 })}
          />
        </div>
      </div>
    </ConfigCard>
  )
}
