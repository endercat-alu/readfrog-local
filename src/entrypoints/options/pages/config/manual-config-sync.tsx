import { i18n } from "#imports"
import { useMutation } from "@tanstack/react-query"
import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { toast } from "sonner"
import { Icon } from "@/components/icon"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/base-ui/alert-dialog"
import { Button } from "@/components/ui/base-ui/button"
import { Input } from "@/components/ui/base-ui/input"
import { Label } from "@/components/ui/base-ui/label"
import { useExportConfig } from "@/hooks/use-export-config"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { addBackup } from "@/utils/backup/storage"
import { migrateConfig } from "@/utils/config/migration"
import { EXTENSION_VERSION } from "@/utils/constants/app"
import { CONFIG_SCHEMA_VERSION } from "@/utils/constants/config"
import { queryClient } from "@/utils/tanstack-query"
import { ConfigCard } from "../../components/config-card"
import { ViewConfig } from "./components/view-config"

function looksLikeConfigPayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  return "language" in value || "providersConfig" in value || "translate" in value
}

function inferSchemaVersionFromFilename(fileName: string): number | null {
  const match = fileName.match(/(?:^|[^0-9])v(\d{1,3})(?:[^0-9]|$)/i)
  if (!match) {
    return null
  }

  const version = Number.parseInt(match[1], 10)
  return Number.isInteger(version) ? version : null
}

function inferSchemaVersionFromConfig(config: unknown): number {
  const page = (config as any)?.translate?.page

  if (Array.isArray(page?.rules)) {
    return 67
  }

  if (
    Array.isArray(page?.autoTranslatePatterns)
    || Array.isArray(page?.autoTranslateLanguages)
    || Array.isArray(page?.skipLanguages)
  ) {
    return 66
  }

  if (page?.nodeIgnoreHeuristics) {
    return 64
  }

  if (typeof page?.minWordsPerNode === "number") {
    return 43
  }

  if (typeof page?.minCharactersPerNode === "number") {
    return 41
  }

  return 1
}

function resolveImportedConfigPayload(fileContent: string, fileName: string): {
  schemaVersion: number
  config: unknown
} {
  const parsed = JSON.parse(fileContent) as {
    schemaVersion?: unknown
    config?: unknown
  }

  if (typeof parsed.schemaVersion === "number" && Number.isInteger(parsed.schemaVersion) && parsed.config !== undefined) {
    return {
      schemaVersion: parsed.schemaVersion,
      config: parsed.config,
    }
  }

  if (parsed.config !== undefined && looksLikeConfigPayload(parsed.config)) {
    return {
      schemaVersion: inferSchemaVersionFromFilename(fileName) ?? inferSchemaVersionFromConfig(parsed.config),
      config: parsed.config,
    }
  }

  if (looksLikeConfigPayload(parsed)) {
    return {
      schemaVersion: inferSchemaVersionFromFilename(fileName) ?? inferSchemaVersionFromConfig(parsed),
      config: parsed,
    }
  }

  throw new TypeError("Invalid config payload")
}

export function ManualConfigSync() {
  const config = useAtomValue(configAtom)
  return (
    <ConfigCard
      id="manual-config-sync"
      title={i18n.t("options.config.sync.title")}
      description={i18n.t("options.config.sync.description")}
    >
      <div className="w-full space-y-4">
        <div className="text-end gap-3 flex justify-end">
          <ImportConfig />
          <ExportConfig />
        </div>
        <ViewConfig config={config} />
      </div>
    </ConfigCard>
  )
}

function ImportConfig() {
  const currentConfig = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)

  const { mutate: importConfig, isPending: isImporting } = useMutation({
    mutationFn: async (file: File) => {
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          const result = event.target?.result
          if (typeof result === "string") {
            resolve(result)
          }
          else {
            reject(new Error("Invalid file content"))
          }
        }
        reader.onerror = () => reject(new Error(i18n.t("options.config.sync.importError")))
        reader.readAsText(file)
      })

      const imported = resolveImportedConfigPayload(fileContent, file.name)
      const newConfig = await migrateConfig(imported.config, imported.schemaVersion)
      await addBackup(currentConfig, EXTENSION_VERSION)
      await setConfig(newConfig)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["config-backups"] })
      toast.success(i18n.t("options.config.sync.importSuccess"))
    },
  })

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importConfig(file)
    }
    e.target.value = ""
    e.target.files = null
  }

  return (
    <Button variant="outline" className="p-0" disabled={isImporting}>
      <Label htmlFor="import-config-file" className="w-full px-3">
        <Icon icon="tabler:file-import" className="size-4" />
        {i18n.t("options.config.sync.import")}
      </Label>
      <Input
        type="file"
        id="import-config-file"
        className="hidden"
        accept=".json"
        onChange={handleImportConfig}
      />
    </Button>
  )
}

function ExportConfig() {
  const [open, setOpen] = useState(false)
  const config = useAtomValue(configAtom)

  const { mutate: exportConfig, isPending: isExporting } = useExportConfig({
    config,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    onSuccess: () => {
      toast.success(i18n.t("options.config.sync.exportSuccess"))
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button disabled={isExporting} />}>
        <Icon icon="tabler:file-export" className="size-4" />
        {i18n.t("options.config.sync.export")}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.t("options.config.sync.exportOptions.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {i18n.t("options.config.sync.exportOptions.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex justify-between!">
          <AlertDialogCancel>{i18n.t("options.config.sync.exportOptions.cancel")}</AlertDialogCancel>
          <div className="flex gap-2">
            <AlertDialogAction variant="secondary" onClick={() => exportConfig(true, { onSettled: () => setOpen(false) })} disabled={isExporting}>
              {i18n.t("options.config.sync.exportOptions.includeAPIKeys")}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => exportConfig(false, { onSettled: () => setOpen(false) })} disabled={isExporting}>
              {i18n.t("options.config.sync.exportOptions.excludeAPIKeys")}
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
