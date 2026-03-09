import type { APIProviderTypes } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"

export function ConfigHeader({ providerType }: { providerType: APIProviderTypes }) {
  const { theme } = useTheme()
  const providerItem = PROVIDER_ITEMS[providerType]

  return (
    <div className="flex items-start justify-between">
      {providerItem.website
        ? (
            <a href={providerItem.website} className="flex items-center gap-2" target="_blank" rel="noreferrer">
              <ProviderIcon
                logo={providerItem.logo(theme)}
                name={providerItem.name}
                size="base"
                className="group hover:cursor-pointer"
                textClassName="font-medium group-hover:text-link"
              />
            </a>
          )
        : (
            <ProviderIcon
              logo={providerItem.logo(theme)}
              name={providerItem.name}
              size="base"
              className="group"
              textClassName="font-medium"
            />
          )}
    </div>
  )
}
