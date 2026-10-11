/** Flat settings section: title + description on the left, content on the right. */
export function Section({ title, description, children, testId }: { title: string; description?: string; children: React.ReactNode; testId?: string }) {
	return (
		<section className="grid gap-4 py-8 first:pt-2 md:grid-cols-[220px_1fr] md:gap-10" data-testid={testId}>
			<div>
				<h2 className="text-sm font-medium">{title}</h2>
				{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
			</div>
			<div className="min-w-0">{children}</div>
		</section>
	);
}
