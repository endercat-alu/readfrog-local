import type { IconProps } from "@iconify/react"
import { addCollection, Icon as BaseIcon } from "@iconify/react"
import fa7BrandsCollection from "@/assets/iconify/fa7-brands.json"
import fluentCollection from "@/assets/iconify/fluent.json"
import logosCollection from "@/assets/iconify/logos.json"
import mdiCollection from "@/assets/iconify/mdi.json"
import riCollection from "@/assets/iconify/ri.json"
import tablerExtraCollection from "@/assets/iconify/tabler-extra.json"
import tablerCollection from "@/assets/iconify/tabler.json"

let isRegistered = false

function ensureLocalCollections() {
  if (isRegistered) {
    return
  }

  addCollection(tablerCollection)
  addCollection(tablerExtraCollection)
  addCollection(mdiCollection)
  addCollection(logosCollection)
  addCollection(riCollection)
  addCollection(fa7BrandsCollection)
  addCollection(fluentCollection)
  isRegistered = true
}

export function Icon(props: IconProps) {
  ensureLocalCollections()
  return <BaseIcon {...props} />
}
