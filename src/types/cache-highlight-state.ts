import { z } from "zod"

export const cacheHighlightStateSchema = z.object({
  enabled: z.boolean(),
})

export type CacheHighlightState = z.infer<typeof cacheHighlightStateSchema>
