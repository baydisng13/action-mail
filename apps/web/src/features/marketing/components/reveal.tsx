import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveals children on scroll-into-view with a staggered rise. CSS-driven -
 * no animation dependency. SSR-safe (starts hidden, animates on mount/scroll).
 */
export function Reveal({
	children,
	delay = 0,
	className,
	as: Tag = "div",
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
	as?: React.ElementType;
}) {
	const ref = useRef<HTMLElement | null>(null);
	const [shown, setShown] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setShown(true);
					io.disconnect();
				}
			},
			{ threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	return (
		<Tag
			ref={ref}
			style={{ transitionDelay: `${delay}ms` }}
			className={cn(
				"transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
				shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-6 opacity-0 blur-[2px]",
				className,
			)}
		>
			{children}
		</Tag>
	);
}
