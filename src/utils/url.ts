import { z } from "zod"

export function matchDomainPattern(url: string, pattern: string): boolean {
  if (!z.url().safeParse(url).success) {
    return false
  }

  const urlObj = new URL(url)
  const hostname = urlObj.hostname.toLowerCase()
  const patternLower = pattern.toLowerCase().trim()

  if (hostname === patternLower) {
    return true
  }

  if (hostname.endsWith(`.${patternLower}`)) {
    return true
  }

  return false
}

export function matchWildcardPattern(value: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim()
  if (!normalizedPattern) {
    return false
  }

  const escapedPattern = normalizedPattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replaceAll("*", ".*")

  return new RegExp(`^${escapedPattern}$`).test(value)
}
