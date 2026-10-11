import * as React from "react";
import { cn } from "@/lib/utils";

interface StepperProps {
  steps: {
    label: string;
  }[];
  currentStep: number;
  className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <div className={cn("flex items-center justify-center w-full", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={step.label}>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isActive || isCompleted
                    ? "bg-primary text-primary-foreground"
                    : "bg-[#CBD5E1] text-white"
                )}
              >
                {index + 1}
              </div>
              <span
                className={cn(
                  "text-sm font-semibold whitespace-nowrap",
                  isActive || isCompleted ? "text-[#101828]" : "text-[#98A2B3]"
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className="mx-6 h-px flex-1 max-w-[140px] bg-[#D0D5DD]" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
