import { i18n } from "#imports"
import { deepmerge } from "deepmerge-ts"
import { useAtom } from "jotai"
import { HelpTooltip } from "@/components/help-tooltip"
import { Field, FieldContent, FieldLabel } from "@/components/ui/base-ui/field"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { ConfigCard } from "../../components/config-card"

export function ShortTextCache() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)

  return (
    <ConfigCard
      id="short-text-cache"
      title={i18n.t("options.translation.shortTextCache.title")}
      description={i18n.t("options.translation.shortTextCache.description")}
    >
      <Field orientation="horizontal">
        <FieldContent className="self-center">
          <FieldLabel htmlFor="short-text-cache-toggle">
            {i18n.t("options.translation.shortTextCache.enable")}
            <HelpTooltip>{i18n.t("options.translation.shortTextCache.enableDescription")}</HelpTooltip>
          </FieldLabel>
        </FieldContent>
        <Switch
          id="short-text-cache-toggle"
          checked={translateConfig.enableShortTextCache}
          onCheckedChange={(checked) => {
            void setTranslateConfig(
              deepmerge(translateConfig, {
                enableShortTextCache: checked,
              }),
            )
          }}
        />
      </Field>
    </ConfigCard>
  )
}
