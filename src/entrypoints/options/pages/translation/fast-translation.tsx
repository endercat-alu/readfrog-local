import type { ProvidersConfig } from "@/types/config/provider"
import { i18n } from "#imports"
import { deepmerge } from "deepmerge-ts"
import { useAtom, useAtomValue } from "jotai"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import { HelpTooltip } from "@/components/help-tooltip"
import { Field, FieldContent, FieldLabel } from "@/components/ui/base-ui/field"
import { Switch } from "@/components/ui/base-ui/switch"
import { SetApiKeyWarning } from "@/entrypoints/options/components/set-api-key-warning"
import { isAPIProviderConfig, isPureAPIProvider } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getProviderConfigById, getTranslateProvidersConfig } from "@/utils/config/helpers"
import { ConfigCard } from "../../components/config-card"

function needsApiKeyWarning(providerId: string, providersConfig: ProvidersConfig): boolean {
  const providerConfig = getProviderConfigById(providersConfig, providerId)
  return !!providerConfig
    && isAPIProviderConfig(providerConfig)
    && !isPureAPIProvider(providerConfig.provider)
    && !providerConfig.apiKey
}

export function FastTranslation() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const fastTranslationConfig = translateConfig.page.fastTranslation
  const isSameAsDefaultProvider = fastTranslationConfig.providerId === translateConfig.providerId

  const availableProviders = getTranslateProvidersConfig(providersConfig)
    .filter(provider => provider.enabled)
    .filter((provider) => {
      if (translateConfig.mode !== "translationOnly") {
        return true
      }
      return provider.provider !== "google-translate"
    })

  return (
    <ConfigCard
      id="fast-translation"
      title={i18n.t("options.translation.fastTranslation.title")}
      description={i18n.t("options.translation.fastTranslation.description")}
    >
      <div className="space-y-4">
        <Field orientation="horizontal">
          <FieldContent className="self-center">
            <FieldLabel htmlFor="fast-translation-toggle">
              {i18n.t("options.translation.fastTranslation.enable")}
              <HelpTooltip>{i18n.t("options.translation.fastTranslation.enableDescription")}</HelpTooltip>
            </FieldLabel>
          </FieldContent>
          <Switch
            id="fast-translation-toggle"
            checked={fastTranslationConfig.enabled}
            onCheckedChange={(checked) => {
              void setTranslateConfig(deepmerge(translateConfig, {
                page: {
                  fastTranslation: {
                    enabled: checked,
                  },
                },
              }))
            }}
          />
        </Field>
        {fastTranslationConfig.enabled && (
          <>
            <Field>
              <FieldLabel nativeLabel={false} render={<div />}>
                {i18n.t("options.translation.fastTranslation.provider")}
                {needsApiKeyWarning(fastTranslationConfig.providerId, providersConfig) && <SetApiKeyWarning />}
              </FieldLabel>
              <ProviderSelector
                providers={availableProviders}
                value={fastTranslationConfig.providerId}
                onChange={(providerId) => {
                  void setTranslateConfig(deepmerge(translateConfig, {
                    page: {
                      fastTranslation: {
                        providerId,
                      },
                    },
                  }))
                }}
                className="w-full"
              />
            </Field>
            {isSameAsDefaultProvider && (
              <p className="text-xs text-muted-foreground">
                {i18n.t("options.translation.fastTranslation.sameAsDefaultProvider")}
              </p>
            )}
            <Field orientation="horizontal">
              <FieldContent className="self-center">
                <FieldLabel htmlFor="fast-translation-overwrite-toggle">
                  {i18n.t("options.translation.fastTranslation.overwriteWithDefault")}
                  <HelpTooltip>{i18n.t("options.translation.fastTranslation.overwriteWithDefaultDescription")}</HelpTooltip>
                </FieldLabel>
              </FieldContent>
              <Switch
                id="fast-translation-overwrite-toggle"
                checked={fastTranslationConfig.overwriteWithDefaultProvider}
                onCheckedChange={(checked) => {
                  void setTranslateConfig(deepmerge(translateConfig, {
                    page: {
                      fastTranslation: {
                        overwriteWithDefaultProvider: checked,
                      },
                    },
                  }))
                }}
              />
            </Field>
          </>
        )}
      </div>
    </ConfigCard>
  )
}
