import { Entity } from "dexie"

export default class CacheAccessRecord extends Entity {
  key!: string
  createdAt!: Date
  eventType!: "exactL1Hit" | "exactL2Hit" | "stableL1Hit" | "stableL2Hit" | "miss"
}
