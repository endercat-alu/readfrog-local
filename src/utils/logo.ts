import type { Theme } from "@/types/config/theme"

const lobehubLogoModules = import.meta.glob("../assets/providers/lobehub/*/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>

const lobehubLogoMap = new Map<string, string>()

for (const [path, url] of Object.entries(lobehubLogoModules)) {
  const match = path.match(/\/(light|dark)\/([^/]+)\.webp$/)

  if (!match) {
    continue
  }

  const [, theme, slug] = match
  lobehubLogoMap.set(`${theme}:${slug}`, url)
}

export function getLobeIconsCDNUrlFn(iconSlug: string) {
  return (theme: Theme = "light") => {
    return lobehubLogoMap.get(`${theme}:${iconSlug}`) ?? lobehubLogoMap.get(`light:${iconSlug}`) ?? ""
  }
}
