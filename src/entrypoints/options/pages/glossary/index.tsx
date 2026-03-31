import type { GlossaryEntry } from "@/types/config/glossary"
import { i18n } from "#imports"
import { useAtom } from "jotai"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/base-ui/button"
import { Checkbox } from "@/components/ui/base-ui/checkbox"
import { Input } from "@/components/ui/base-ui/input"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { cn } from "@/utils/styles/utils"
import { ConfigCard } from "../../components/config-card"
import { EntityEditorLayout } from "../../components/entity-editor-layout"
import { EntityListRail } from "../../components/entity-list-rail"
import { PageLayout } from "../../components/page-layout"
import { selectedGlossaryEntryIdAtom } from "./atoms"

function createDefaultTerm(entries: GlossaryEntry[]): string {
  const baseTerm = i18n.t("options.glossary.defaultTerm")
  const existingTerms = new Set(entries.map(entry => entry.term.trim().toLowerCase()))

  if (!existingTerms.has(baseTerm.toLowerCase())) {
    return baseTerm
  }

  for (let index = 2; ; index++) {
    const nextTerm = `${baseTerm} ${index}`
    if (!existingTerms.has(nextTerm.toLowerCase())) {
      return nextTerm
    }
  }
}

function updateGlossaryEntry(
  entries: GlossaryEntry[],
  entryId: string,
  patch: Partial<GlossaryEntry>,
): GlossaryEntry[] {
  return entries.map(entry => entry.id === entryId ? { ...entry, ...patch } : entry)
}

function GlossaryConfig() {
  const [glossary, setGlossary] = useAtom(configFieldsAtomMap.glossary)
  const [selectedEntryId, setSelectedEntryId] = useAtom(selectedGlossaryEntryIdAtom)
  const entries = glossary.entries
  const selectedEntry = entries.find(entry => entry.id === selectedEntryId) ?? null

  const handleAdd = () => {
    const term = createDefaultTerm(entries)
    const nextEntry: GlossaryEntry = {
      id: crypto.randomUUID(),
      term,
      translation: term,
      description: "",
      llmOnly: false,
    }

    void setGlossary({
      ...glossary,
      entries: [...entries, nextEntry],
    })
    setSelectedEntryId(nextEntry.id)
  }

  const handleDelete = (entryId: string) => {
    const nextEntries = entries.filter(entry => entry.id !== entryId)
    void setGlossary({
      ...glossary,
      entries: nextEntries,
    })
    setSelectedEntryId(nextEntries[0]?.id ?? null)
  }

  return (
    <ConfigCard
      id="glossary"
      title={i18n.t("options.glossary.title")}
      description={i18n.t("options.glossary.description")}
      className="lg:flex-col"
    >
      <EntityEditorLayout
        list={(
          <div className="flex flex-col gap-4">
            <Button variant="outline" className="h-auto p-3 border-dashed rounded-xl" onClick={handleAdd}>
              <div className="flex items-center justify-center gap-2 w-full">
                <Icon icon="tabler:plus" className="size-4" />
                <span className="text-sm">{i18n.t("options.glossary.add")}</span>
              </div>
            </Button>
            {entries.length > 0 && (
              <EntityListRail>
                <div className="flex flex-col gap-3 pt-2">
                  {entries.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      className={cn(
                        "rounded-xl border p-3 bg-card text-left transition-colors",
                        selectedEntryId === entry.id && "border-primary",
                      )}
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      <div className="text-sm font-medium truncate">{entry.term}</div>
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{entry.translation}</div>
                      {entry.llmOnly && (
                        <div className="mt-2 text-[11px] text-blue-600 dark:text-blue-400">
                          {i18n.t("options.glossary.llmOnlyBadge")}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </EntityListRail>
            )}
          </div>
        )}
        editor={selectedEntry
          ? (
              <div className="rounded-xl border bg-card p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{i18n.t("options.glossary.fields.term")}</label>
                  <Input
                    value={selectedEntry.term}
                    onChange={(event) => {
                      void setGlossary({
                        ...glossary,
                        entries: updateGlossaryEntry(entries, selectedEntry.id, { term: event.target.value }),
                      })
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{i18n.t("options.glossary.fields.translation")}</label>
                  <Input
                    value={selectedEntry.translation}
                    onChange={(event) => {
                      void setGlossary({
                        ...glossary,
                        entries: updateGlossaryEntry(entries, selectedEntry.id, { translation: event.target.value }),
                      })
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{i18n.t("options.glossary.fields.description")}</label>
                  <Textarea
                    value={selectedEntry.description}
                    onChange={(event) => {
                      void setGlossary({
                        ...glossary,
                        entries: updateGlossaryEntry(entries, selectedEntry.id, { description: event.target.value }),
                      })
                    }}
                    className="min-h-28"
                  />
                </div>
                <label className="flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer">
                  <Checkbox
                    checked={selectedEntry.llmOnly}
                    onCheckedChange={(checked) => {
                      void setGlossary({
                        ...glossary,
                        entries: updateGlossaryEntry(entries, selectedEntry.id, { llmOnly: checked }),
                      })
                    }}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">{i18n.t("options.glossary.fields.llmOnly")}</span>
                    <span className="block text-xs text-muted-foreground">{i18n.t("options.glossary.fields.llmOnlyDescription")}</span>
                  </span>
                </label>
                <div className="flex justify-end">
                  <Button variant="destructive" onClick={() => handleDelete(selectedEntry.id)}>
                    {i18n.t("options.glossary.delete")}
                  </Button>
                </div>
              </div>
            )
          : (
              <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                {i18n.t("options.glossary.empty")}
              </div>
            )}
      />
    </ConfigCard>
  )
}

export function GlossaryPage() {
  return (
    <PageLayout title={i18n.t("options.glossary.title")}>
      <div className="*:border-b [&>*:last-child]:border-b-0">
        <GlossaryConfig />
      </div>
    </PageLayout>
  )
}
