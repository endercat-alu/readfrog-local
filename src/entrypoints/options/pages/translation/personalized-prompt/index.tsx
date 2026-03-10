import { i18n } from "#imports"
import { PromptConfigurator } from "@/components/prompt-configurator"
import { promptAtoms } from "./atoms"

export function PersonalizedPrompts() {
  return (
    <PromptConfigurator
      id="personalized-prompts"
      promptAtoms={promptAtoms}
      title={i18n.t("options.translation.personalizedPrompts.title")}
      description={i18n.t("options.translation.personalizedPrompts.description")}
    />
  )
}
