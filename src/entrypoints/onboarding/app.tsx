import { browser, i18n } from "#imports"
import * as React from "react"
import frogIcon from "@/assets/icons/read-frog.png?url&no-inline"
import { Icon } from "@/components/icon"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/base-ui/alert"
import { Button } from "@/components/ui/base-ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/base-ui/card"
import { cn } from "@/utils/styles/utils"

const ALL_SITES_PERMISSION = { origins: ["*://*/*"] }

function StatusBadge({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        done
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/12 text-amber-700 dark:text-amber-300",
      )}
    >
      <Icon icon={done ? "tabler:check" : "tabler:clock-hour-4"} className="size-3.5" />
      {done ? i18n.t("onboarding.status.done") : i18n.t("onboarding.status.pending")}
    </span>
  )
}

function App() {
  const isFirefox = import.meta.env.BROWSER === "firefox"
  const [hasAllSitesPermission, setHasAllSitesPermission] = React.useState(!isFirefox)
  const [permissionStateLoaded, setPermissionStateLoaded] = React.useState(!isFirefox)
  const [isRequestingPermission, setIsRequestingPermission] = React.useState(false)
  const [permissionError, setPermissionError] = React.useState("")

  React.useEffect(() => {
    let isMounted = true

    const syncGuideState = async () => {
      if (!isFirefox)
        return

      const granted = await browser.permissions.contains(ALL_SITES_PERMISSION)
      if (!isMounted)
        return

      setHasAllSitesPermission(granted)
      setPermissionStateLoaded(true)
    }

    void syncGuideState()

    return () => {
      isMounted = false
    }
  }, [isFirefox])

  const requestAllSitesPermission = async () => {
    setIsRequestingPermission(true)
    setPermissionError("")

    try {
      const granted = await browser.permissions.request(ALL_SITES_PERMISSION)
      const currentGranted = granted || await browser.permissions.contains(ALL_SITES_PERMISSION)

      setHasAllSitesPermission(currentGranted)
      setPermissionStateLoaded(true)

      if (!currentGranted) {
        setPermissionError(i18n.t("onboarding.steps.firefoxPermission.denied"))
      }
    }
    catch {
      setPermissionError(i18n.t("onboarding.steps.firefoxPermission.denied"))
      setPermissionStateLoaded(true)
    }
    finally {
      setIsRequestingPermission(false)
    }
  }

  const setupReady = permissionStateLoaded && (!isFirefox || hasAllSitesPermission)

  const iconUrl = new URL(frogIcon, browser.runtime.getURL("/")).href

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#d8ead5_0%,var(--background)_42%),linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--background)_88%,#d4e8d1))]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10 md:px-10 md:py-14">
        <section className="rounded-[32px] border border-border/70 bg-card/92 p-6 shadow-[0_24px_80px_rgba(30,60,40,0.08)] backdrop-blur md:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_320px]">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <img src={iconUrl} alt="Read Frog" className="size-14 rounded-2xl shadow-sm" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-primary">{i18n.t("name")}</p>
                  <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                    {i18n.t("onboarding.title")}
                  </h1>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {i18n.t("onboarding.description")}
              </p>

              {isFirefox
                ? (
                    <Card className="border-border/70 bg-background/70 shadow-none">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle>{i18n.t("onboarding.steps.firefoxPermission.title")}</CardTitle>
                            <CardDescription>{i18n.t("onboarding.steps.firefoxPermission.description")}</CardDescription>
                          </div>
                          <StatusBadge done={permissionStateLoaded && hasAllSitesPermission} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {hasAllSitesPermission
                          ? (
                              <Alert>
                                <Icon icon="tabler:shield-check" className="size-4" />
                                <AlertTitle>{i18n.t("onboarding.steps.firefoxPermission.granted")}</AlertTitle>
                              </Alert>
                            )
                          : (
                              <Alert variant="destructive">
                                <Icon icon="tabler:alert-triangle" className="size-4" />
                                <AlertTitle>{i18n.t("onboarding.steps.firefoxPermission.title")}</AlertTitle>
                                <AlertDescription>
                                  {permissionError || i18n.t("onboarding.steps.firefoxPermission.denied")}
                                </AlertDescription>
                              </Alert>
                            )}
                        <Button
                          className="w-full sm:w-auto"
                          onClick={requestAllSitesPermission}
                          disabled={isRequestingPermission || hasAllSitesPermission}
                        >
                          {isRequestingPermission
                            ? i18n.t("onboarding.steps.firefoxPermission.requesting")
                            : hasAllSitesPermission
                              ? i18n.t("onboarding.steps.firefoxPermission.granted")
                              : i18n.t("onboarding.steps.firefoxPermission.request")}
                        </Button>
                      </CardContent>
                    </Card>
                  )
                : (
                    <Card className="border-border/70 bg-background/70 shadow-none">
                      <CardHeader>
                        <CardTitle>{i18n.t("onboarding.readyTitle")}</CardTitle>
                        <CardDescription>{i18n.t("onboarding.readyDescription")}</CardDescription>
                      </CardHeader>
                    </Card>
                  )}
            </div>

            <Card className="border-border/70 bg-background/72 shadow-none">
              <CardHeader>
                <div className="space-y-3">
                  <StatusBadge done={setupReady} />
                  <div className="space-y-1">
                    <CardTitle>{i18n.t("onboarding.readyTitle")}</CardTitle>
                    <CardDescription>{i18n.t("onboarding.readyDescription")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  {i18n.t("onboarding.finishHint")}
                </p>
                <Button
                  className="w-full"
                  variant={setupReady ? "default" : "outline"}
                  onClick={() => browser.runtime.openOptionsPage()}
                >
                  {i18n.t("onboarding.steps.options.action")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
