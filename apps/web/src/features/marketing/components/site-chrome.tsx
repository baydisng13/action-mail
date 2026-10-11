import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/features/auth/components/wordmark";

export function SiteNav() {
	return (
		<header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
				<Wordmark />
				<nav className="hidden items-center gap-1 md:flex">
					<a href="/#features" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">Features</a>
					<Link to="/pricing" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</Link>
					<Link to="/privacy" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">Privacy</Link>
				</nav>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm">
						<Link to="/login">Sign in</Link>
					</Button>
					<Button asChild size="sm">
						<Link to="/register">
							Get started
							<ArrowRight className="h-4 w-4" />
						</Link>
					</Button>
				</div>
			</div>
		</header>
	);
}

export function SiteFooter() {
	return (
		<footer>
			<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
				<Wordmark className="text-xl" />
				<p className="text-sm text-muted-foreground/70">© 2026 Postscript. The signal, none of the noise.</p>
				<div className="flex gap-4 text-sm text-muted-foreground">
					<Link to="/pricing" className="hover:text-foreground">Pricing</Link>
					<Link to="/privacy" className="hover:text-foreground">Privacy</Link>
					<Link to="/login" className="hover:text-foreground">Sign in</Link>
				</div>
			</div>
		</footer>
	);
}
