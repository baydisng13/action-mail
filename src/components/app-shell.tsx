import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { env } from "@/env";

export function AppShell({ children }: { children: React.ReactNode }) {
	const title = env.VITE_APP_TITLE ?? "Cookflow";

	return (
		<div className="flex min-h-svh flex-col">
			<header className="border-b bg-background">
				<div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
					<Link to="/" className="font-semibold tracking-tight">
						{title}
					</Link>
					<nav className="flex items-center gap-2">
						<Button variant="ghost" size="sm" asChild>
							<Link to="/">Home</Link>
						</Button>
						<Button variant="ghost" size="sm" asChild>
							<Link to="/example">Todos</Link>
						</Button>
					</nav>
				</div>
			</header>
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
				{children}
			</main>
		</div>
	);
}
