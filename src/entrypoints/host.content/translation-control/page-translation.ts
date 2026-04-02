import type { Config } from "@/types/config/config"
import { getDetectedCodeFromStorage } from "@/utils/config/languages"
import { getLocalConfig } from "@/utils/config/storage"
import { CONTENT_WRAPPER_CLASS } from "@/utils/constants/dom-labels"
import { hasNoWalkAncestor, isDontWalkIntoButTranslateAsChildElement, isHTMLElement } from "@/utils/host/dom/filter"
import { walkAndLabelElement } from "@/utils/host/dom/traversal"
import { removeAllTranslatedWrapperNodes, translateWalkedElement } from "@/utils/host/translate/node-manipulation"
import { validateTranslationConfigAndToast } from "@/utils/host/translate/translate-text"
import { sendMessage } from "@/utils/message"

type SimpleIntersectionOptions = Omit<IntersectionObserverInit, "threshold"> & {
  threshold?: number
}

interface IPageTranslationManager {
  /**
   * Indicates whether the page translation is currently active
   */
  readonly isActive: boolean

  /**
   * Starts the automatic page translation functionality
   * Registers observers, touch triggers and set storage
   */
  start: () => Promise<void>

  /**
   * Stops the automatic page translation functionality
   * Cleans up all observers and removes translated content and set storage
   */
  stop: () => void

  /**
   * Refreshes page translation after SPA navigation without disabling the feature.
   */
  refreshForNavigation: () => void

  /**
   * Registers page translation triggers
   */
  registerPageTranslationTriggers: () => () => void
}

export class PageTranslationManager implements IPageTranslationManager {
  private static readonly MAX_DURATION = 500
  private static readonly MOVE_THRESHOLD = 30 * 30
  private static readonly NAVIGATION_CONTENT_SETTLE_DELAY = 120
  private static readonly MUTATION_SCAN_BATCH_DELAY = 16
  private static readonly DEFAULT_INTERSECTION_OPTIONS: SimpleIntersectionOptions = {
    root: null,
    rootMargin: "600px",
    threshold: 0.1,
  }

  private isPageTranslating: boolean = false
  private intersectionObserver: IntersectionObserver | null = null
  private mutationObservers: MutationObserver[] = []
  private walkId: string | null = null
  private intersectionOptions: IntersectionObserverInit
  private dontWalkIntoElementsCache = new WeakSet<HTMLElement>()
  private navigationTimer: number | null = null
  private navigationMutationObserver: MutationObserver | null = null
  private pendingNavigationWalkId: string | null = null
  private sessionVersion = 0
  private cleanupController: AbortController | null = null
  private translationController: AbortController | null = null
  private sessionConfig: Config | null = null
  private observedMutationRoots = new WeakSet<HTMLElement>()
  private queuedMutationScanContainers = new Set<HTMLElement>()
  private mutationScanTimer: number | null = null

  constructor(intersectionOptions: SimpleIntersectionOptions = {}) {
    if (intersectionOptions.threshold !== undefined) {
      if (intersectionOptions.threshold < 0 || intersectionOptions.threshold > 1) {
        throw new Error("IntersectionObserver threshold must be between 0 and 1")
      }
    }

    this.intersectionOptions = {
      ...PageTranslationManager.DEFAULT_INTERSECTION_OPTIONS,
      ...intersectionOptions,
    }
  }

  get isActive(): boolean {
    return this.isPageTranslating
  }

  setConfig(config: Config | null): void {
    this.sessionConfig = config
  }

  async start(): Promise<void> {
    if (this.isPageTranslating) {
      console.warn("PageTranslationManager is already active")
      return
    }

    const config = this.sessionConfig ?? await getLocalConfig()
    if (!config) {
      console.warn("Config is not initialized")
      return
    }
    this.sessionConfig = config

    const detectedCode = await getDetectedCodeFromStorage()

    if (!validateTranslationConfigAndToast({
      providersConfig: config.providersConfig,
      translate: config.translate,
      language: config.language,
    }, detectedCode)) {
      return
    }

    void sendMessage("setAndNotifyPageTranslationStateChangedByManager", {
      enabled: true,
    })

    this.isPageTranslating = true
    await this.startObservationSession()
  }

  stop(): void {
    if (!this.isPageTranslating) {
      console.warn("AutoTranslationManager is already inactive")
      return
    }

    void sendMessage("setAndNotifyPageTranslationStateChangedByManager", {
      enabled: false,
    })

    this.isPageTranslating = false
    const walkId = this.walkId ?? this.pendingNavigationWalkId
    this.cancelPendingNavigationRefresh()
    this.abortTranslation()
    this.abortCleanup()
    this.resetObservationSession()
    this.pendingNavigationWalkId = null
    this.scheduleCleanup(walkId)
  }

  refreshForNavigation(): void {
    if (!this.isPageTranslating)
      return

    const walkId = this.walkId
    const currentVersion = ++this.sessionVersion
    this.pendingNavigationWalkId = walkId

    this.cancelPendingNavigationRefresh()
    this.abortTranslation()
    this.abortCleanup()
    this.resetObservationSession()
    this.waitForNavigationContent(currentVersion, walkId)
  }

  registerPageTranslationTriggers(): () => void {
    let startTime = 0
    let startTouches: TouchList | null = null

    const reset = () => {
      startTime = 0
      startTouches = null
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 4) {
        startTime = performance.now()
        startTouches = e.touches
      }
      else {
        reset()
      }
    }

    const onMove = (e: TouchEvent) => {
      if (!startTouches)
        return
      if (e.touches.length !== 4)
        return reset()

      for (let i = 0; i < 4; i++) {
        const dx = e.touches[i].clientX - startTouches[i].clientX
        const dy = e.touches[i].clientY - startTouches[i].clientY
        if (dx * dx + dy * dy > PageTranslationManager.MOVE_THRESHOLD)
          return reset()
      }
    }

    const onEnd = () => {
      if (!startTouches)
        return
      if (performance.now() - startTime < PageTranslationManager.MAX_DURATION)
        this.isPageTranslating ? this.stop() : void this.start()
      reset()
    }

    document.addEventListener("touchstart", onStart, { passive: true })
    document.addEventListener("touchmove", onMove, { passive: true })
    document.addEventListener("touchend", onEnd, { passive: true })
    document.addEventListener("touchcancel", reset, { passive: true })

    // 供调用方卸载
    return () => {
      document.removeEventListener("touchstart", onStart)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onEnd)
      document.removeEventListener("touchcancel", reset)
    }
  }

  private observeTopLevelParagraphs(container: HTMLElement): void {
    const observer = this.intersectionObserver
    const config = this.sessionConfig
    if (!this.walkId || !observer || !config)
      return

    if (hasNoWalkAncestor(container, config))
      return

    const scanResult = walkAndLabelElement(container, this.walkId, config, {
      collectParagraphs: true,
      collectMutationRoots: true,
      dontWalkIntoElementsCache: this.dontWalkIntoElementsCache,
    })

    this.observeMutationRoots(scanResult.isolatedMutationRoots)

    if (container.hasAttribute("data-read-frog-paragraph") && container.getAttribute("data-read-frog-walked") === this.walkId) {
      observer.observe(container)
      return
    }

    scanResult.topLevelParagraphs.forEach(el => observer.observe(el))
  }

  /**
   * Handle style/class attribute changes and only trigger observation
   * when element transitions from "don't walk into" to "walkable"
   */
  private didChangeToWalkable(element: HTMLElement): boolean {
    const wasDontWalkInto = this.dontWalkIntoElementsCache.has(element)
    const isDontWalkIntoNow = isDontWalkIntoButTranslateAsChildElement(element)

    // Update cache with current state
    if (isDontWalkIntoNow) {
      this.dontWalkIntoElementsCache.add(element)
    }
    else {
      this.dontWalkIntoElementsCache.delete(element)
    }

    // Only trigger observation if element transitioned from "don't walk into" to "walkable"
    // wasDontWalkInto === true means it was previously not walkable
    // isDontWalkIntoNow === false means it's now walkable
    return wasDontWalkInto === true && isDontWalkIntoNow === false
  }

  private queueMutationContainerScan(container: HTMLElement): void {
    if (!this.isPageTranslating || !this.walkId) {
      return
    }

    if (this.isInternalTranslationElement(container)) {
      return
    }

    this.queuedMutationScanContainers.add(container)
    if (this.mutationScanTimer !== null) {
      return
    }

    const version = this.sessionVersion
    this.mutationScanTimer = window.setTimeout(() => {
      this.mutationScanTimer = null
      this.flushQueuedMutationContainerScans(version)
    }, PageTranslationManager.MUTATION_SCAN_BATCH_DELAY)
  }

  private flushQueuedMutationContainerScans(version: number): void {
    if (!this.isPageTranslating || version !== this.sessionVersion || !this.walkId) {
      this.queuedMutationScanContainers.clear()
      return
    }

    const containers = Array.from(this.queuedMutationScanContainers)
    this.queuedMutationScanContainers.clear()
    const queuedSet = new Set(containers)

    for (const container of containers) {
      let current = container.parentElement
      let shouldSkip = false

      while (current) {
        if (queuedSet.has(current)) {
          shouldSkip = true
          break
        }
        current = current.parentElement
      }

      if (!shouldSkip) {
        this.observeTopLevelParagraphs(container)
      }
    }
  }

  private observeMutationRoot(container: HTMLElement): void {
    if (this.observedMutationRoots.has(container)) {
      return
    }

    this.observedMutationRoots.add(container)
    const mutationObserver = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === "childList") {
          if (this.isInternalTranslationNode(rec.target)) {
            continue
          }

          rec.addedNodes.forEach((node) => {
            if (isHTMLElement(node) && !this.isInternalTranslationElement(node)) {
              this.queueMutationContainerScan(node)
            }
          })
        }
        else if (
          rec.type === "attributes"
          && (rec.attributeName === "style" || rec.attributeName === "class")
        ) {
          const el = rec.target
          if (isHTMLElement(el) && !this.isInternalTranslationElement(el) && this.didChangeToWalkable(el)) {
            this.queueMutationContainerScan(el)
          }
        }
      }
    })

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    })

    this.mutationObservers.push(mutationObserver)
  }

  private observeMutationRoots(containers: HTMLElement[]): void {
    for (const container of containers) {
      this.observeMutationRoot(container)
    }
  }

  private waitForNavigationContent(version: number, walkId: string | null): void {
    const root = document.body
    if (!root) {
      this.pendingNavigationWalkId = null
      return
    }

    const scheduleResume = () => {
      if (this.navigationTimer !== null) {
        window.clearTimeout(this.navigationTimer)
      }

      this.navigationTimer = window.setTimeout(() => {
        this.navigationTimer = null
        this.navigationMutationObserver?.disconnect()
        this.navigationMutationObserver = null
        void this.resumeAfterNavigation(version, walkId)
      }, PageTranslationManager.NAVIGATION_CONTENT_SETTLE_DELAY)
    }

    this.navigationMutationObserver = new MutationObserver((records) => {
      if (!this.isPageTranslating || version !== this.sessionVersion) {
        this.cancelPendingNavigationRefresh()
        return
      }

      if (records.some(record => this.isMeaningfulNavigationMutation(record))) {
        scheduleResume()
      }
    })

    this.navigationMutationObserver.observe(root, {
      childList: true,
      subtree: true,
    })
  }

  private isMeaningfulNavigationMutation(record: MutationRecord): boolean {
    if (record.type !== "childList") {
      return false
    }

    if (record.removedNodes.length > 0 && !record.target.parentElement?.closest(`.${CONTENT_WRAPPER_CLASS}`)) {
      return true
    }

    return false
  }

  private async resumeAfterNavigation(version: number, walkId: string | null): Promise<void> {
    if (!this.isPageTranslating || version !== this.sessionVersion) {
      return
    }

    await this.cleanupWalk(walkId)

    if (!this.isPageTranslating || version !== this.sessionVersion) {
      return
    }

    this.pendingNavigationWalkId = null
    await this.startObservationSession(version)
  }

  private async startObservationSession(version: number = ++this.sessionVersion): Promise<void> {
    this.cancelPendingNavigationRefresh()
    this.resetObservationSession()
    this.abortTranslation()

    const config = this.sessionConfig ?? await getLocalConfig()
    if (!config) {
      return
    }
    this.sessionConfig = config

    const walkId = crypto.randomUUID()
    const controller = new AbortController()
    const signal = controller.signal
    this.walkId = walkId
    this.translationController = controller
    this.intersectionObserver = new IntersectionObserver(async (entries, observer) => {
      const currentConfig = this.sessionConfig
      if (!currentConfig) {
        observer.disconnect()
        return
      }

      for (const entry of entries) {
        if (!this.isPageTranslating || version !== this.sessionVersion || signal.aborted) {
          observer.disconnect()
          return
        }

        if (entry.isIntersecting) {
          if (isHTMLElement(entry.target)) {
            if (!entry.target.closest(`.${CONTENT_WRAPPER_CLASS}`)) {
              const requestPriority = this.isActuallyVisibleInViewport(entry.target) ? "visible" as const : "prefetch" as const
              observer.unobserve(entry.target)

              if (!this.isPageTranslating || version !== this.sessionVersion || this.walkId !== walkId || signal.aborted)
                return

              void translateWalkedElement(entry.target, walkId, currentConfig, false, {
                signal,
                requestPriority,
              })
            }
          }
        }
      }
    }, this.intersectionOptions)

    this.observeTopLevelParagraphs(document.body)

    if (!this.isPageTranslating || version !== this.sessionVersion || this.walkId !== walkId || signal.aborted) {
      this.resetObservationSession()
      return
    }

    this.observeMutationRoot(document.body)
  }

  private async cleanupWalk(walkId: string | null): Promise<void> {
    const controller = new AbortController()
    this.cleanupController = controller
    await removeAllTranslatedWrapperNodes(document, {
      walkId: walkId ?? undefined,
      signal: controller.signal,
    }).finally(() => {
      if (controller.signal.aborted || this.cleanupController !== controller)
        return

      this.cleanupController = null
    })
  }

  private scheduleCleanup(walkId: string | null): void {
    void this.cleanupWalk(walkId)
  }

  private abortCleanup(): void {
    this.cleanupController?.abort()
    this.cleanupController = null
  }

  private abortTranslation(): void {
    this.translationController?.abort()
    this.translationController = null
  }

  private cancelPendingNavigationRefresh(): void {
    if (this.navigationTimer !== null) {
      window.clearTimeout(this.navigationTimer)
      this.navigationTimer = null
    }

    if (this.navigationMutationObserver) {
      this.navigationMutationObserver.disconnect()
      this.navigationMutationObserver = null
    }
  }

  private resetObservationSession(): void {
    this.walkId = null
    this.dontWalkIntoElementsCache = new WeakSet()
    this.observedMutationRoots = new WeakSet()
    this.queuedMutationScanContainers.clear()

    if (this.mutationScanTimer !== null) {
      window.clearTimeout(this.mutationScanTimer)
      this.mutationScanTimer = null
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }

    this.mutationObservers.forEach(observer => observer.disconnect())
    this.mutationObservers = []
  }

  private isInternalTranslationNode(node: Node | null): boolean {
    if (!node) {
      return false
    }

    if (isHTMLElement(node)) {
      return this.isInternalTranslationElement(node)
    }

    return !!node.parentElement?.closest(`.${CONTENT_WRAPPER_CLASS}`)
  }

  private isInternalTranslationElement(element: HTMLElement): boolean {
    return !!element.closest(`.${CONTENT_WRAPPER_CLASS}`)
  }

  private isActuallyVisibleInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight

    return rect.bottom > 0
      && rect.right > 0
      && rect.top < viewportHeight
      && rect.left < viewportWidth
  }
}
