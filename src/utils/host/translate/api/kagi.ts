import type { LangCodeISO6391 } from "@read-frog/definitions"
import type { PureAPIProviderConfig } from "@/types/config/provider"
import { browser } from "#imports"
import { DEFAULT_PROVIDER_CONFIG } from "@/utils/constants/providers"
import { sendMessage } from "@/utils/message"

export interface KagiProviderOptions {
  manualSessionToken?: string
  addresseeGender?: string
  speakerGender?: string
  formality?: string
  style?: string
  context?: string
  preserveFormatting?: boolean
  stream?: boolean
  model?: string
  extensionContext?: string
  keepToken?: boolean
  headers?: Record<string, string>
}

export function getKagiProviderOptions(providerConfig: PureAPIProviderConfig): KagiProviderOptions {
  if (providerConfig.provider !== "kagi") {
    return {}
  }
  const options = providerConfig.providerOptions
  return options && typeof options === "object" ? options as KagiProviderOptions : {}
}

export function formatKagiLang(lang: string): string {
  if (lang === "auto") {
    return "auto"
  }
  return lang.toLowerCase().replace(/-/g, "_")
}

export function buildKagiApiUrl(baseURL: string, endpoint: "translate" | "auth"): URL {
  const url = new URL(baseURL)
  const normalizedPath = url.pathname.replace(/\/+$/, "").replace(/\/api\/(?:translate|auth)$/, "")

  if (normalizedPath.endsWith("/api")) {
    url.pathname = `${normalizedPath}/${endpoint}`
    return url
  }

  if (normalizedPath === "" || normalizedPath === "/") {
    url.pathname = `/api/${endpoint}`
    return url
  }

  url.pathname = `${normalizedPath}/api/${endpoint}`
  return url
}

export function buildKagiTranslationBody(
  sourceText: string,
  fromLang: string,
  toLang: string,
  providerConfig: PureAPIProviderConfig,
  options?: { isBatch?: boolean },
) {
  const providerOptions = getKagiProviderOptions(providerConfig)

  return Object.fromEntries(
    Object.entries({
      text: sourceText,
      source_lang: formatKagiLang(fromLang),
      target_lang: formatKagiLang(toLang),
      addressee_gender: providerOptions.addresseeGender,
      speaker_gender: providerOptions.speakerGender,
      formality: providerOptions.formality,
      translation_style: providerOptions.style,
      context: providerOptions.context,
      preserve_formatting: providerOptions.preserveFormatting,
      stream: providerOptions.stream ?? false,
      model: providerOptions.model || "standard",
      extensionContext: providerOptions.extensionContext || (options?.isBatch ? "batch-translation" : "overlay"),
    }).filter(([, value]) => value !== undefined),
  )
}

export function extractKagiTranslationFromJson(result: unknown): string {
  if (result && typeof result === "object") {
    if ("translation" in result && typeof result.translation === "string") {
      return result.translation
    }
    if ("error" in result && typeof result.error === "string" && result.error) {
      throw new Error(result.error)
    }
  }
  throw new Error("Unexpected response format from Kagi translation API")
}

export function parseKagiStreamResponse(body: string): string {
  let translation = ""

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith("data:")) {
      continue
    }

    const payload = line.slice(5).trim()
    if (!payload || payload === "[DONE]") {
      continue
    }

    try {
      const data = JSON.parse(payload)
      if (typeof data.translation === "string") {
        translation = data.translation
      }
      else if (typeof data.delta === "string") {
        translation += data.delta
      }
    }
    catch {
    }
  }

  if (!translation) {
    throw new Error("Empty response from Kagi translation stream")
  }

  return translation
}

const KAGI_HMAC_KEY = "1b8d84c96e3a6b0e9a554ca81b735cf41c250f7ae5a1d84a2f405ef6584e6e82"
const KAGI_AUTH_CACHE_TTL_MS = 5 * 60 * 1000

let cachedAuth: { token: string, expiresAt: number } | null = null

function getExtensionBrowser() {
  const extensionUrl = browser.runtime.getURL("")
  if (extensionUrl.startsWith("moz-extension://")) {
    return "firefox"
  }
  if (extensionUrl.startsWith("chrome-extension://")) {
    return "chrome"
  }
  if (extensionUrl.startsWith("safari-web-extension://")) {
    return "safari"
  }
  return "unknown"
}

async function buildKagiSignature(url: URL) {
  const timestamp = Date.now().toString()
  const payload = `${timestamp}|${url.pathname}${url.search}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(KAGI_HMAC_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))

  return {
    "X-Ext-Timestamp": timestamp,
    "X-Ext-Signature": Array.from(new Uint8Array(signature))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join(""),
  }
}

async function getKagiSessionCookieValue() {
  const cookieDetails = { url: "https://kagi.com", name: "kagi_session" } as const
  const getCookie = browser.cookies.get as (details: { url: string, name: string, firstPartyDomain?: string }) => Promise<{ value?: string } | null>

  try {
    const cookie = await getCookie(cookieDetails)
    return cookie?.value ?? null
  }
  catch (error) {
    if (!String(error).includes("firstPartyDomain")) {
      return null
    }
  }

  try {
    const cookie = await getCookie({
      ...cookieDetails,
      firstPartyDomain: "kagi.com",
    })
    return cookie?.value ?? null
  }
  catch {
    return null
  }
}

async function getStoredManualSessionToken() {
  const result = await browser.storage.local.get("kagi_manual_session_token")
  return typeof result.kagi_manual_session_token === "string" && result.kagi_manual_session_token.trim()
    ? result.kagi_manual_session_token.trim()
    : null
}

async function ensureManualTokenIsValid(token: string, providerConfig: PureAPIProviderConfig) {
  const now = Date.now()
  if (cachedAuth?.token === token && cachedAuth.expiresAt > now) {
    return token
  }

  const options = getKagiProviderOptions(providerConfig)
  const authUrl = buildKagiApiUrl(providerConfig.baseURL || "https://translate.kagi.com", "auth")
  authUrl.searchParams.set("token", token)
  authUrl.searchParams.set("keepToken", String(options.keepToken ?? true))

  const signatureHeaders = await buildKagiSignature(authUrl)
  const response = await fetch(authUrl, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Kagi-Extension": "true",
      "X-Extension-Version": browser.runtime.getManifest().version || "unknown",
      "X-Extension-Browser": getExtensionBrowser(),
      ...signatureHeaders,
    },
  })

  if (!response.ok) {
    throw new Error(`Kagi auth request failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json().catch(() => null)
  if (result && typeof result === "object" && "loggedIn" in result && result.loggedIn === false) {
    throw new Error("Kagi manual session token is invalid")
  }

  cachedAuth = {
    token,
    expiresAt: now + KAGI_AUTH_CACHE_TTL_MS,
  }

  return token
}

async function resolveManualToken(providerConfig: PureAPIProviderConfig) {
  const providerOptions = getKagiProviderOptions(providerConfig)
  const candidates = [
    typeof providerOptions.manualSessionToken === "string" && providerOptions.manualSessionToken.trim()
      ? providerOptions.manualSessionToken.trim()
      : null,
    await getStoredManualSessionToken(),
    typeof providerConfig.apiKey === "string" && providerConfig.apiKey.trim() ? providerConfig.apiKey.trim() : null,
  ].filter((value): value is string => !!value)

  for (const token of candidates) {
    try {
      return await ensureManualTokenIsValid(token, providerConfig)
    }
    catch {
    }
  }

  return null
}

export async function performKagiTranslate(
  sourceText: string,
  fromLang: string,
  toLang: string,
  providerConfig: PureAPIProviderConfig,
  options?: { isBatch?: boolean },
) {
  const baseURL = providerConfig.baseURL || "https://translate.kagi.com"
  const providerOptions = getKagiProviderOptions(providerConfig)
  const sessionCookie = await getKagiSessionCookieValue()
  let manualToken = sessionCookie ? null : await resolveManualToken(providerConfig)

  if (!sessionCookie && !manualToken) {
    throw new Error("Kagi session not found. Please log in to Kagi or provide a manual session token.")
  }

  const url = buildKagiApiUrl(baseURL, "translate")
  if (manualToken) {
    url.searchParams.set("token", manualToken)
    url.searchParams.set("keepToken", String(providerOptions.keepToken ?? true))
  }

  const requestBody = buildKagiTranslationBody(sourceText, fromLang, toLang, providerConfig, options)
  const extensionContext = typeof requestBody.extensionContext === "string" ? requestBody.extensionContext : "overlay"
  delete requestBody.extensionContext

  const signatureHeaders = await buildKagiSignature(url)
  const extraHeaders = providerOptions.headers && typeof providerOptions.headers === "object"
    ? Object.fromEntries(Object.entries(providerOptions.headers).filter(([, value]) => typeof value === "string"))
    : {}

  let response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Extension-Context": extensionContext,
      "X-Kagi-Extension": "true",
      "X-Extension-Version": browser.runtime.getManifest().version || "unknown",
      "X-Extension-Browser": getExtensionBrowser(),
      ...signatureHeaders,
      ...extraHeaders,
    },
    body: JSON.stringify(requestBody),
  })

  if (response.status === 401 && sessionCookie && !manualToken) {
    manualToken = await resolveManualToken(providerConfig)
    if (manualToken) {
      const retryUrl = buildKagiApiUrl(baseURL, "translate")
      retryUrl.searchParams.set("token", manualToken)
      retryUrl.searchParams.set("keepToken", String(providerOptions.keepToken ?? true))
      const retrySignatureHeaders = await buildKagiSignature(retryUrl)

      response = await fetch(retryUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Extension-Context": extensionContext,
          "X-Kagi-Extension": "true",
          "X-Extension-Version": browser.runtime.getManifest().version || "unknown",
          "X-Extension-Browser": getExtensionBrowser(),
          ...retrySignatureHeaders,
          ...extraHeaders,
        },
        body: JSON.stringify(requestBody),
      })
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    if (response.status === 401) {
      throw new Error("Kagi authentication failed. Please check your session status.")
    }
    throw new Error(`Kagi translation request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`)
  }

  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("text/event-stream")) {
    return parseKagiStreamResponse(await response.text())
  }

  return extractKagiTranslationFromJson(await response.json())
}

export async function kagiTranslate(
  sourceText: string,
  fromLang: LangCodeISO6391 | "auto",
  toLang: LangCodeISO6391,
  providerConfig: PureAPIProviderConfig,
  options?: { isBatch?: boolean, runInBackground?: boolean },
): Promise<string> {
  const normalizedProviderConfig = providerConfig.provider === "kagi"
    ? providerConfig
    : DEFAULT_PROVIDER_CONFIG.kagi

  if (options?.runInBackground) {
    return await performKagiTranslate(
      sourceText,
      fromLang,
      toLang,
      normalizedProviderConfig,
      options,
    )
  }

  return await sendMessage("kagiTranslate", {
    sourceText,
    fromLang,
    toLang,
    providerConfig: normalizedProviderConfig,
    options: {
      isBatch: options?.isBatch,
    },
  })
}
