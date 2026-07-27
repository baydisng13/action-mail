import { Filter } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function FilterButton({
	hasActiveFilters = false,
	children,
	popoverContentClassName,
	align = "end",
	side = "bottom",
	sideOffset = 10,
	...props
}: {
	hasActiveFilters?: boolean;
	children:
	| React.ReactNode
	| ((props: { onClose: () => void }) => React.ReactNode);
	popoverContentClassName?: string;
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	sideOffset?: number;
} & Omit<React.ComponentPropsWithoutRef<typeof Button>, "children">) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					size="sm"
					variant="outline"
					{...props}
					className={cn(
						"gap-2 px-4 text-sm font-medium shrink-0",
						hasActiveFilters && "border-primary bg-primary/5",
						props.className
					)}
				>
					<Filter className="h-4 w-4 shrink-0" />
					<span className="hidden sm:flex">Filter</span>
					{hasActiveFilters ? (
						<span
							className="h-2 w-2 shrink-0 rounded-full bg-primary"
							aria-hidden
						/>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className={cn(
					"w-[320px] border-none bg-transparent p-0 shadow-none z-100000",
					popoverContentClassName
				)}
				align={align}
				side={side}
				sideOffset={sideOffset}
			>
				{typeof children === "function"
					? children({ onClose: () => setOpen(false) })
					: children}
			</PopoverContent>
		</Popover>
	);
}

