import type { ParagraphSegmentationRule } from "@/types/config/translate"
import { i18n } from "#imports"
import { useAtom } from "jotai"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/base-ui/checkbox"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/base-ui/field"
import { Input } from "@/components/ui/base-ui/input"
import { Label } from "@/components/ui/base-ui/label"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { MAX_PARAGRAPH_LINES_PER_SEGMENT, MIN_PARAGRAPH_LINES_PER_SEGMENT } from "@/utils/constants/translate"
import { ConfigCard } from "../../components/config-card"

const RULE_ITEMS: ParagraphSegmentationRule[] = ["blankLine", "visualLines"]

export function ParagraphSegmentation() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const { paragraphSegmentation } = translateConfig.page
  const visualLinesEnabled = paragraphSegmentation.enabledRules.includes("visualLines")

  const toggleRule = (rule: ParagraphSegmentationRule, checked: boolean) => {
    const enabledRules = checked
      ? Array.from(new Set([...paragraphSegmentation.enabledRules, rule]))
      : paragraphSegmentation.enabledRules.filter(item => item !== rule)

    void setTranslateConfig({
      ...translateConfig,
      page: {
        ...translateConfig.page,
        paragraphSegmentation: {
          ...paragraphSegmentation,
          enabledRules,
        },
      },
    })
  }

  return (
    <ConfigCard
      id="paragraph-segmentation"
      title={i18n.t("options.translation.paragraphSegmentation.title")}
      description={i18n.t("options.translation.paragraphSegmentation.description")}
    >
      <FieldGroup className="gap-4">
        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium">
            {i18n.t("options.translation.paragraphSegmentation.definitions.title")}
          </div>
          {RULE_ITEMS.map(rule => (
            <div key={rule} className="flex items-start gap-2">
              <Checkbox
                id={`paragraph-segmentation-${rule}`}
                checked={paragraphSegmentation.enabledRules.includes(rule)}
                onCheckedChange={checked => toggleRule(rule, checked)}
              />
              <Label htmlFor={`paragraph-segmentation-${rule}`} className="cursor-pointer text-sm font-normal leading-6">
                {i18n.t(`options.translation.paragraphSegmentation.definitions.${rule}`)}
              </Label>
            </div>
          ))}
        </div>

        <Field orientation="responsive">
          <FieldContent className="self-center">
            <FieldLabel htmlFor="paragraph-max-lines">
              {i18n.t("options.translation.paragraphSegmentation.maxLinesPerParagraph.title")}
            </FieldLabel>
          </FieldContent>
          <Input
            id="paragraph-max-lines"
            className="w-40 shrink-0"
            type="number"
            min={MIN_PARAGRAPH_LINES_PER_SEGMENT}
            max={MAX_PARAGRAPH_LINES_PER_SEGMENT}
            step={1}
            disabled={!visualLinesEnabled}
            value={paragraphSegmentation.maxLinesPerParagraph}
            onChange={(e) => {
              const newValue = Number(e.target.value)
              if (newValue >= MIN_PARAGRAPH_LINES_PER_SEGMENT && newValue <= MAX_PARAGRAPH_LINES_PER_SEGMENT) {
                void setTranslateConfig({
                  ...translateConfig,
                  page: {
                    ...translateConfig.page,
                    paragraphSegmentation: {
                      ...paragraphSegmentation,
                      maxLinesPerParagraph: newValue,
                    },
                  },
                })
              }
              else {
                toast.error(i18n.t("options.translation.paragraphSegmentation.error", [MIN_PARAGRAPH_LINES_PER_SEGMENT, MAX_PARAGRAPH_LINES_PER_SEGMENT]))
              }
            }}
          />
        </Field>
      </FieldGroup>
    </ConfigCard>
  )
}
