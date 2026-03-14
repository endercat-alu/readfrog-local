import { z } from "zod"

export const floatingButtonSideSchema = z.enum(["left", "right"])
export const floatingButtonExpandModeSchema = z.enum(["hover", "always"])

export const selectionToolbarActionSchema = z.enum([
  "vocabularyInsight",
  "translate",
  "speak",
  "customFeatures",
])

export const contextMenuItemSchema = z.enum([
  "selectionTranslate",
  "selectionVocabularyInsight",
  "selectionDictionary",
  "togglePageTranslation",
  "translateSelectionInHub",
  "openOptions",
])

export const contextMenuTargetSchema = z.enum([
  "page",
  "selection",
  "link",
  "image",
  "editable",
])

export const floatingButtonAppearanceSchema = z.object({
  side: floatingButtonSideSchema,
  expandMode: floatingButtonExpandModeSchema,
  showQuickTranslateButton: z.boolean(),
  showSettingsButton: z.boolean(),
  showCloseButton: z.boolean(),
  idleOpacity: z.number().min(0.2).max(1),
  scale: z.number().min(0.8).max(1.4),
})

export const selectionToolbarAppearanceSchema = z.object({
  buttonOrder: z.array(selectionToolbarActionSchema),
  showCloseButton: z.boolean(),
  buttonSize: z.number().int().min(24).max(40),
  maxWidth: z.number().int().min(160).max(960),
})

export const contextMenuContextSchema = z.object({
  enabled: z.boolean(),
  collapsed: z.boolean(),
  items: z.array(contextMenuItemSchema),
})

export const contextMenuContextsSchema = z.object({
  page: contextMenuContextSchema,
  selection: contextMenuContextSchema,
  link: contextMenuContextSchema,
  image: contextMenuContextSchema,
  editable: contextMenuContextSchema,
})

export type FloatingButtonSide = z.infer<typeof floatingButtonSideSchema>
export type FloatingButtonExpandMode = z.infer<typeof floatingButtonExpandModeSchema>
export type SelectionToolbarAction = z.infer<typeof selectionToolbarActionSchema>
export type ContextMenuItem = z.infer<typeof contextMenuItemSchema>
export type ContextMenuTarget = z.infer<typeof contextMenuTargetSchema>
