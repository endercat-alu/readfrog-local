import { atom } from "jotai"
import { configFieldsAtomMap } from "@/utils/atoms/config"

const internalSelectedGlossaryEntryIdAtom = atom<string | null>(null)

export const selectedGlossaryEntryIdAtom = atom(
  (get) => {
    const selectedId = get(internalSelectedGlossaryEntryIdAtom)
    const entries = get(configFieldsAtomMap.glossary).entries

    if (selectedId && entries.some(entry => entry.id === selectedId)) {
      return selectedId
    }

    return entries[0]?.id ?? null
  },
  (_get, set, nextId: string | null) => {
    set(internalSelectedGlossaryEntryIdAtom, nextId)
  },
)
