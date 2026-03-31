interface CacheEntry<V> {
  value: V
  expiresAt: number
}

export interface CacheSnapshotEntry<K, V> {
  key: K
  value: V
  expiresAt: number
}

export class LruTtlCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>()

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }

    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })

    while (this.store.size > this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      this.store.delete(oldestKey)
    }
  }

  clear(): void {
    this.store.clear()
  }

  count(): number {
    this.pruneExpired()
    return this.store.size
  }

  snapshotEntries(limit: number = Number.POSITIVE_INFINITY): CacheSnapshotEntry<K, V>[] {
    this.pruneExpired()

    const entries = Array.from(this.store.entries())
      .reverse()
      .slice(0, limit)
      .map(([key, entry]) => ({
        key,
        value: entry.value,
        expiresAt: entry.expiresAt,
      }))

    return entries
  }

  private pruneExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key)
      }
    }
  }
}
