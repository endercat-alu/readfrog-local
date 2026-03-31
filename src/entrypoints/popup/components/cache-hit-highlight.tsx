import { browser, i18n } from "#imports"
import { useAtom } from "jotai"
import { Switch } from "@/components/ui/base-ui/switch"
import { sendMessage } from "@/utils/message"
import { isCacheHitHighlightEnabledAtom } from "../atoms/cache-hit-highlight"

export function CacheHitHighlight() {
  const [enabled, setEnabled] = useAtom(isCacheHitHighlightEnabledAtom)

  const handleCheckedChange = async (checked: boolean) => {
    const [currentTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })

    if (!currentTab?.id) {
      return
    }

    await sendMessage("tryToSetCacheHighlightStateByTabId", {
      tabId: currentTab.id,
      enabled: checked,
    })
    setEnabled(checked)
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-medium">
        {i18n.t("popup.cacheHitHighlight")}
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={handleCheckedChange}
      />
    </div>
  )
}
