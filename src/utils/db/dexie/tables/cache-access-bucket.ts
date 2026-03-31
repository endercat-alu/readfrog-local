import { Entity } from "dexie"

export default class CacheAccessBucket extends Entity {
  key!: string
  bucketStart!: Date
  exactL1Hits!: number
  exactL2Hits!: number
  stableL1Hits!: number
  stableL2Hits!: number
  misses!: number
}
