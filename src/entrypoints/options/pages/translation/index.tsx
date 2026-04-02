import { i18n } from "#imports"
import { PageLayout } from "../../components/page-layout"
import { AIContentAware } from "./ai-content-aware"
import { ClearCacheConfig } from "./clear-cache-config"
import { CustomTranslationStyle } from "./custom-translation-style"
import { FastTranslation } from "./fast-translation"
import { NodeTranslationHotkey } from "./node-translation-hotkey"
import { PageTranslationShortcut } from "./page-translation-shortcut"
import { ParagraphSegmentation } from "./paragraph-segmentation"
import { PersonalizedPrompts } from "./personalized-prompt"
import { PreloadConfig } from "./preload-config"
import { RequestBatch } from "./request-batch"
import { RequestRate } from "./request-rate"
import { ShortTextCache } from "./short-text-cache"
import { TranslateRange } from "./translate-range"
import { TranslationMode } from "./translation-mode"

export function TranslationPage() {
  return (
    <PageLayout title={i18n.t("options.translation.title")} innerClassName="*:border-b [&>*:last-child]:border-b-0">
      <TranslationMode />
      <FastTranslation />
      <TranslateRange />
      <PageTranslationShortcut />
      <NodeTranslationHotkey />
      <ParagraphSegmentation />
      <CustomTranslationStyle />
      <ShortTextCache />
      <AIContentAware />
      <PersonalizedPrompts />
      <RequestRate />
      <RequestBatch />
      <PreloadConfig />
      <ClearCacheConfig />
    </PageLayout>
  )
}
