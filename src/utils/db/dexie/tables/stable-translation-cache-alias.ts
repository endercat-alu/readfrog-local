import { Entity } from "dexie"

export default class StableTranslationCacheAlias extends Entity {
  key!: string
  exactKey!: string
  createdAt!: Date
  lastAccessedAt!: Date
}
