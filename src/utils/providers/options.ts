import type { JSONValue } from "ai"
import { CUSTOM_LLM_PROVIDER_TYPES } from "@/types/config/provider"
import { LLM_MODEL_OPTIONS } from "../constants/models"

const OPENAI_COMPATIBLE_PROVIDER_TYPES = new Set<string>(CUSTOM_LLM_PROVIDER_TYPES)

const OPENAI_COMPATIBLE_OPTION_ALIASES = {
  reasoning_effort: "reasoningEffort",
  verbosity: "textVerbosity",
} as const satisfies Record<string, string>

function normalizeUserProviderOptions(
  provider: string,
  userOptions: Record<string, JSONValue>,
): Record<string, JSONValue> {
  if (!OPENAI_COMPATIBLE_PROVIDER_TYPES.has(provider)) {
    return userOptions
  }

  let changed = false
  const normalizedOptions: Record<string, JSONValue> = { ...userOptions }

  for (const [rawKey, canonicalKey] of Object.entries(OPENAI_COMPATIBLE_OPTION_ALIASES)) {
    if (!(rawKey in normalizedOptions)) {
      continue
    }

    if (!(canonicalKey in normalizedOptions)) {
      normalizedOptions[canonicalKey] = normalizedOptions[rawKey]
    }

    delete normalizedOptions[rawKey]
    changed = true
  }

  return changed ? normalizedOptions : userOptions
}

/**
 * Get provider options for AI SDK generateText calls.
 * Matches model name against patterns and returns options for the current provider.
 * First match wins - more specific patterns should be placed first in MODEL_OPTIONS.
 */
export function getProviderOptions(
  model: string,
  provider: string,
): Record<string, Record<string, JSONValue>> {
  for (const { pattern, options } of LLM_MODEL_OPTIONS) {
    if (pattern.test(model)) {
      return { [provider]: options }
    }
  }
  return {}
}

/**
 * Get provider options for AI SDK generateText calls.
 * If user-defined options exist, use them directly (no merge).
 * Otherwise fall back to default pattern-matched options.
 */
export function getProviderOptionsWithOverride(
  model: string,
  provider: string,
  userOptions?: Record<string, JSONValue>,
): Record<string, Record<string, JSONValue>> {
  // User options completely override defaults
  if (userOptions && Object.keys(userOptions).length > 0) {
    return { [provider]: normalizeUserProviderOptions(provider, userOptions) }
  }

  return getProviderOptions(model, provider)
}
