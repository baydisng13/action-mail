"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value?: Date;
  onChange: (value?: Date) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  disableDate?: (date: Date) => boolean;
  defaultTime?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date and time",
  className,
  disabled,
  disableDate,
  defaultTime = "00:00",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const timeValue = useMemo(() => {
    if (!value) return defaultTime;
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }, [defaultTime, value]);

  const handleDateChange = (selectedDate?: Date) => {
    if (!selectedDate) {
      onChange(undefined);
      return;
    }

    const base = value ? new Date(value) : new Date();
    const next = new Date(selectedDate);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(next);
  };

  const handleTimeChange = (nextTime: string) => {
    const [hours, minutes] = nextTime.split(":").map(Number);
    const base = value ? new Date(value) : new Date();
    base.setHours(Number.isFinite(hours) ? hours : 0);
    base.setMinutes(Number.isFinite(minutes) ? minutes : 0);
    base.setSeconds(0);
    base.setMilliseconds(0);
    onChange(base);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-[42px] w-full justify-between rounded-xl border border-text-light-60 bg-[rgba(240,245,245,0.6)] px-4 text-sm font-normal shadow-none hover:bg-[rgba(240,245,245,0.8)]",
            !value && "text-dark-60",
            className,
          )}
        >
          <span>{value ? format(value, "MMM dd, yyyy HH:mm") : placeholder}</span>
          <CalendarIcon className="h-4 w-4 text-dark-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50" align="center">
        <div className="flex">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateChange}
            disabled={disableDate}
          />
          <div className="w-[168px] border-l border-border p-3">
            <p className="text-xs font-medium text-dark-100 mb-2">Time</p>
            <Input
              type="time"
              value={timeValue}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
