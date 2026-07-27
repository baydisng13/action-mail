"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group peer border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 [&[data-state=checked],&[data-state=indeterminate]]:border-primary [&[data-state=checked],&[data-state=indeterminate]]:bg-primary [&[data-state=checked],&[data-state=indeterminate]]:text-primary-foreground dark:[&[data-state=checked],&[data-state=indeterminate]]:bg-primary dark:[&[data-state=checked],&[data-state=indeterminate]]:text-primary-foreground",
        className
      )}
      {...props}
    >
      {/*
        Radix sets data-state on the Indicator span (not only the button).
        Toggle check vs minus using the Indicator’s own data-state so partial selection always shows minus.
      */}
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn(
          "grid grid-cols-1 grid-rows-1 place-content-center text-current transition-none",
          "data-[state=indeterminate]:[&_[data-slot=checkbox-check]]:hidden",
          "data-[state=indeterminate]:[&_[data-slot=checkbox-minus]]:!flex",
        )}
      >
        <span
          data-slot="checkbox-check"
          className="col-start-1 row-start-1 flex items-center justify-center text-inherit"
        >
          <CheckIcon className="size-3.5 shrink-0 text-inherit" />
        </span>
        <span
          data-slot="checkbox-minus"
          className="col-start-1 row-start-1 hidden items-center justify-center text-inherit"
        >
          <MinusIcon className="size-3.5 shrink-0 stroke-[2.5] text-inherit" aria-hidden />
        </span>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
