import { z } from "zod"

export const glossaryEntrySchema = z.object({
  id: z.string().nonempty(),
  term: z.string(),
  translation: z.string(),
  description: z.string(),
  llmOnly: z.boolean(),
})

export const glossaryConfigSchema = z.object({
  entries: z.array(glossaryEntrySchema),
})

export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>
export type GlossaryConfig = z.infer<typeof glossaryConfigSchema>
