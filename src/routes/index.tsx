import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	return (
		<div className="space-y-8">
			<section className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Cookflow</h1>
				<p className="text-muted-foreground">
					Plan meals, organize recipes, and cook with confidence.
				</p>
			</section>

			<section className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Get started</CardTitle>
						<CardDescription>Run the app locally</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 font-mono text-sm">
						<p>pnpm install</p>
						<p>pnpm dev</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Code standards</CardTitle>
						<CardDescription>Conventions for this repo</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							See{" "}
							<code className="rounded bg-muted px-1">CODE_STANDARDS.md</code>{" "}
							for formatting, structure, and naming rules.
						</p>
					</CardContent>
				</Card>
			</section>

			<div className="flex flex-wrap gap-3">
				<Button asChild>
					<Link to="/example">Todo list</Link>
				</Button>
			</div>
		</div>
	);
}
