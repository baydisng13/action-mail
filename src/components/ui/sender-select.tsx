import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type SenderOption = {
  label: string
  value: string
}

type SenderSelectProps = {
  label?: string
  value: string
  onChange: (value: string) => void
  options: SenderOption[]
  placeholder?: string
  className?: string
  labelClassName?: string
  triggerClassName?: string
  contentClassName?: string
}

export function SenderSelect({
  label = "Sender Address",
  value,
  onChange,
  options,
  placeholder = "Choose Sender",
  className,
  labelClassName,
  triggerClassName,
  contentClassName,
}: SenderSelectProps) {
  return (
    <div className={cn("space-y-2 w-full", className)}>
      {label && <Label className={labelClassName}>{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn("w-full h-[56px]!", triggerClassName)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
