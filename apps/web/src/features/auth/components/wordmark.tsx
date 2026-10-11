import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Postscript wordmark. The trailing dot is the "signal", rendered in the
 * accent color as a small nod to the product idea (surface the signal).
 */
export function Wordmark({
	className,
	to = "/",
}: {
	className?: string;
	to?: string;
}) {
	return (
		<Link
			to={to}
			className={cn(
				"font-display text-2xl leading-none tracking-tight text-foreground",
				className,
			)}
		>
			Postscript<span className="text-primary">.</span>
		</Link>
	);
}
