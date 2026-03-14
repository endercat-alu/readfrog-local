import { cn } from "@/utils/styles/utils"

export default function HiddenButton({
  icon,
  onClick,
  children,
  className,
  side = "right",
  expandMode = "hover",
}: {
  icon: React.ReactNode
  onClick: () => void
  children?: React.ReactNode
  className?: string
  side?: "left" | "right"
  expandMode?: "hover" | "always"
}) {
  const isRight = side === "right"
  const offsetClass = expandMode === "always"
    ? "translate-x-0"
    : isRight
      ? "translate-x-12 group-hover:translate-x-0"
      : "-translate-x-12 group-hover:translate-x-0"

  return (
    <button
      type="button"
      className={cn(
        "border-border cursor-pointer rounded-full border bg-white p-1.5 text-neutral-600 dark:text-neutral-400 transition-transform duration-300 hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800",
        isRight ? "mr-2" : "ml-2",
        offsetClass,
        className,
      )}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  )
}
