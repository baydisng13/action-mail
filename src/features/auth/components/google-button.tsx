import { Button } from "@/components/ui/button";

/** Full-page navigation to the server OAuth start route (sets state cookie). */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
	return (
		<Button
			asChild
			variant="outline"
			className="w-full border-white/15 bg-white/[0.03] hover:bg-white/[0.06]"
		>
			<a href="/api/auth/google">
				<GoogleGlyph />
				{label}
			</a>
		</Button>
	);
}

function GoogleGlyph() {
	return (
		<svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
			<path
				fill="#EA4335"
				d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2 12 2 6.9 2 2.8 6.1 2.8 11.2S6.9 20.4 12 20.4c6 0 9.3-4.2 9.3-9.1 0-.6-.1-1-.2-1.5H12z"
			/>
		</svg>
	);
}
