import { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type FilterTabItem<T extends string> = {
  label: string
  value: T
  icon?: ReactNode
  widthClassName?: string
  count?: number
  countActiveClassName?: string
  countInactiveClassName?: string
}

export type FilterTabsProps<T extends string> = {
  tabs: ReadonlyArray<FilterTabItem<T>>
  value: T
  onChange: (value: T) => void
  className?: string
  tabsWrapperClassName?: string
  activeClassName?: string
  inactiveClassName?: string
  underlineClassName?: string
  count?: number
  countClassName?: string
}

const baseActiveClass = "text-[#1AAB4E]"
const baseInactiveClass = "text-gray-600 hover:text-gray-900"

export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  tabsWrapperClassName,
  activeClassName,
  inactiveClassName,
  underlineClassName,
  count,
  countClassName,
}: FilterTabsProps<T>) {
  return (
    <div className={cn("relative border-b border-gray-200", className)}>
      <div className={cn("flex items-center", tabsWrapperClassName)}>
        {tabs.map((tab) => {
          const isActive = tab.value === value
          const tabCount = tab.count ?? count
          const baseCountClass =
            "px-2 py-0.5 text-xs font-medium rounded transition-colors"
          const countClass = isActive
            ? cn(
                baseCountClass,
                tab.countActiveClassName ??
                  countClassName ??
                  "bg-emerald-700 text-white"
              )
            : cn(
                baseCountClass,
                tab.countInactiveClassName ??
                  countClassName ??
                  "bg-emerald-100 text-emerald-700"
              )

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative flex items-center gap-2 pb-4 justify-center text-sm font-medium cursor-pointer transition-colors",
                tab.widthClassName ?? "min-w-32",
                isActive
                  ? cn(baseActiveClass, activeClassName)
                  : cn(baseInactiveClass, inactiveClassName)
              )}
              aria-pressed={isActive}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tabCount !== undefined && (
                <span className={countClass}>{tabCount}</span>
              )}
              {isActive && (
                <span
                  className={cn(
                    "absolute bottom-0 left-0 right-0 h-0.5 bg-[#1AAB4E] -mb-px",
                    underlineClassName
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
