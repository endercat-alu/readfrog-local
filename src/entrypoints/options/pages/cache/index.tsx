import type { TranslationCacheInspection } from "@/types/cache-inspector"
import { i18n } from "#imports"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/base-ui/button"
import { Card, CardContent } from "@/components/ui/base-ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/base-ui/dialog"
import { Input } from "@/components/ui/base-ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/base-ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/base-ui/tabs"
import { sendMessage } from "@/utils/message"
import { addThousandsSeparator } from "@/utils/utils"
import { PageLayout } from "../../components/page-layout"

const CACHE_RANGE_ITEMS = ["1H", "12H", "1D", "7D", "14D"] as const

function CacheMetricCard({ title, value, icon }: { title: string, value: string, icon: string }) {
  return (
    <Card className="shadow-xs">
      <CardContent className="flex items-center gap-4">
        <div className="size-10 flex items-center justify-center rounded-xl bg-zinc-200 text-black dark:bg-zinc-800 dark:text-white">
          <Icon icon={icon} className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="text-lg font-semibold tabular-nums break-all">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return "-"
  }

  return new Date(timestamp).toLocaleString()
}

function formatExpiry(expiresAt?: number): string {
  if (!expiresAt) {
    return "-"
  }

  const remainingMs = Math.max(0, expiresAt - Date.now())
  const remainingMinutes = Math.floor(remainingMs / 60000)
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000)
  return `${remainingMinutes}m ${remainingSeconds}s`
}

export function CachePage() {
  const [inspectionOpen, setInspectionOpen] = useState(false)
  const [inspectionTitle, setInspectionTitle] = useState("")
  const [inspection, setInspection] = useState<TranslationCacheInspection | null>(null)
  const [isInspecting, setIsInspecting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [rangeKey, setRangeKey] = useState<(typeof CACHE_RANGE_ITEMS)[number]>("1D")

  const { data, isPending, refetch } = useQuery({
    queryKey: ["translation-cache-overview", rangeKey],
    queryFn: async () => await sendMessage("getTranslationCacheOverview", { rangeKey }),
  })

  async function handleInspect(layer: "l1" | "l2") {
    setInspectionOpen(true)
    setInspectionTitle(layer === "l1" ? i18n.t("options.cache.dialog.l1Title") : i18n.t("options.cache.dialog.l2Title"))
    setInspection(null)
    setIsInspecting(true)
    setSearchQuery("")

    try {
      const result = await sendMessage("inspectTranslationCacheLayer", { layer })
      setInspection(result)
    }
    finally {
      setIsInspecting(false)
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredInspection = inspection
    ? {
        ...inspection,
        tables: inspection.tables.map(table => ({
          ...table,
          entries: normalizedSearchQuery
            ? table.entries.filter((entry) => {
                const key = entry.key.toLowerCase()
                const value = entry.value.toLowerCase()
                return key.includes(normalizedSearchQuery) || value.includes(normalizedSearchQuery)
              })
            : table.entries,
        })),
      }
    : null

  return (
    <PageLayout title={i18n.t("options.cache.title")} innerClassName="flex flex-col p-8 gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">{i18n.t("options.cache.range.label")}</span>
          <Tabs className="w-auto" defaultValue={rangeKey} value={rangeKey} onValueChange={setRangeKey}>
            <TabsList className="bg-background">
              {CACHE_RANGE_ITEMS.map(item => (
                <TabsTrigger key={item} value={item} className="transition-none data-[state=active]:bg-primary-weak! data-[state=active]:shadow-none">
                  {item}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="text-sm text-muted-foreground">
          {data
            ? i18n.t("options.cache.range.description", [data.range.label, formatTimestamp(data.range.startAt), formatTimestamp(data.range.endAt)])
            : i18n.t("options.cache.range.loading")}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CacheMetricCard title={i18n.t("options.cache.metrics.totalRequests")} value={addThousandsSeparator(data?.stats.totalRequests ?? 0)} icon="tabler:arrows-shuffle" />
        <CacheMetricCard title={i18n.t("options.cache.metrics.totalHits")} value={addThousandsSeparator(data?.stats.totalHits ?? 0)} icon="tabler:target-arrow" />
        <CacheMetricCard title={i18n.t("options.cache.metrics.totalMisses")} value={addThousandsSeparator(data?.stats.totalMisses ?? 0)} icon="tabler:target-off" />
        <CacheMetricCard title={i18n.t("options.cache.metrics.hitRate")} value={formatPercent(data?.stats.hitRate ?? 0)} icon="tabler:gauge" />
        <CacheMetricCard title={i18n.t("options.cache.metrics.exactL1Hits")} value={addThousandsSeparator(data?.stats.exactL1Hits ?? 0)} icon="tabler:bolt" />
        <CacheMetricCard title={i18n.t("options.cache.metrics.exactL2Hits")} value={addThousandsSeparator(data?.stats.exactL2Hits ?? 0)} icon="tabler:database-search" />
        <CacheMetricCard title={i18n.t("options.cache.metrics.stableL1Hits")} value={addThousandsSeparator(data?.stats.stableL1Hits ?? 0)} icon="tabler:sparkles" />
        <CacheMetricCard title={i18n.t("options.cache.metrics.stableL2Hits")} value={addThousandsSeparator(data?.stats.stableL2Hits ?? 0)} icon="tabler:database-star" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <CacheMetricCard title={i18n.t("options.cache.tables.l1Exact")} value={addThousandsSeparator(data?.tables.l1ExactCount ?? 0)} icon="tabler:stack-2" />
        <CacheMetricCard title={i18n.t("options.cache.tables.l1Stable")} value={addThousandsSeparator(data?.tables.l1StableCount ?? 0)} icon="tabler:stack-3" />
        <CacheMetricCard title={i18n.t("options.cache.tables.l2Exact")} value={addThousandsSeparator(data?.tables.l2ExactCount ?? 0)} icon="tabler:database" />
        <CacheMetricCard title={i18n.t("options.cache.tables.l2Stable")} value={addThousandsSeparator(data?.tables.l2StableCount ?? 0)} icon="tabler:database-heart" />
        <CacheMetricCard title={i18n.t("options.cache.tables.l2Summary")} value={addThousandsSeparator(data?.tables.l2SummaryCount ?? 0)} icon="tabler:file-text" />
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => handleInspect("l1")} disabled={isInspecting}>
          {i18n.t("options.cache.actions.viewL1")}
        </Button>
        <Button variant="outline" onClick={() => handleInspect("l2")} disabled={isInspecting}>
          {i18n.t("options.cache.actions.viewL2")}
        </Button>
        <Button variant="ghost" onClick={() => void refetch()} disabled={isPending}>
          {i18n.t("options.cache.actions.refresh")}
        </Button>
      </section>

      <Dialog open={inspectionOpen} onOpenChange={setInspectionOpen}>
        <DialogContent className="sm:max-w-[min(1100px,calc(100%-2rem))] max-h-[85vh] h-[85vh] w-[min(1100px,calc(100%-2rem))] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{inspectionTitle}</DialogTitle>
            <DialogDescription>
              {filteredInspection
                ? i18n.t("options.cache.dialog.description", [filteredInspection.limit, formatTimestamp(filteredInspection.generatedAt)])
                : i18n.t("options.cache.dialog.loading")}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pt-2">
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.currentTarget.value)}
              placeholder={i18n.t("options.cache.dialog.searchPlaceholder")}
            />
          </div>
          <div className="min-h-0 flex-1 px-6 pb-6 overflow-y-auto">
            {isInspecting && (
              <div className="py-8 text-sm text-muted-foreground">{i18n.t("options.cache.dialog.loading")}</div>
            )}
            {!isInspecting && filteredInspection && (
              <div className="flex flex-col gap-6">
                {filteredInspection.tables.map(table => (
                  <section key={table.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-base font-semibold">{table.title}</h2>
                      <span className="text-sm text-muted-foreground">
                        {i18n.t("options.cache.dialog.entryCount", [addThousandsSeparator(table.count)])}
                      </span>
                      {table.limited && (
                        <span className="text-sm text-muted-foreground">
                          {i18n.t("options.cache.dialog.limitHint", [filteredInspection.limit])}
                        </span>
                      )}
                      {normalizedSearchQuery && (
                        <span className="text-sm text-muted-foreground">
                          {i18n.t("options.cache.dialog.filteredEntryCount", [addThousandsSeparator(table.entries.length)])}
                        </span>
                      )}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{i18n.t("options.cache.dialog.columns.key")}</TableHead>
                          <TableHead>{i18n.t("options.cache.dialog.columns.content")}</TableHead>
                          <TableHead>{filteredInspection.layer === "l1" ? i18n.t("options.cache.dialog.columns.expiresIn") : i18n.t("options.cache.dialog.columns.createdAt")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {table.entries.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-muted-foreground">
                              {normalizedSearchQuery
                                ? i18n.t("options.cache.dialog.emptySearch")
                                : i18n.t("options.cache.dialog.empty")}
                            </TableCell>
                          </TableRow>
                        )}
                        {table.entries.map(entry => (
                          <TableRow key={entry.key}>
                            <TableCell className="max-w-[260px]">
                              <div className="font-mono text-xs whitespace-pre-wrap break-all">{entry.key}</div>
                            </TableCell>
                            <TableCell className="max-w-[520px]">
                              <div className="font-mono text-xs whitespace-pre-wrap break-all">{entry.value}</div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {filteredInspection.layer === "l1" ? formatExpiry(entry.expiresAt) : formatTimestamp(entry.lastAccessedAt ?? entry.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                ))}
              </div>
            )}
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
