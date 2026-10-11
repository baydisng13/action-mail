import { createFileRoute } from "@tanstack/react-router";
import { useConfig } from "@/features/auth/hooks";
import { SiteFooter, SiteNav } from "@/features/marketing/components/site-chrome";

export const Route = createFileRoute("/privacy")({
	head: () => ({ meta: [{ title: "Privacy | Postscript" }] }),
	component: PrivacyPage,
});

function Block({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mt-10">
			<h2 className="font-display text-2xl tracking-tight">{title}</h2>
			<div className="mt-3 space-y-3 text-[15px] leading-relaxed text-foreground/85">{children}</div>
		</section>
	);
}

function PrivacyPage() {
	const config = useConfig();
	const ai = config.data?.aiProvider ?? "DeepSeek (api.deepseek.com)";
	return (
		<div className="dark min-h-svh bg-background text-foreground antialiased">
			<SiteNav />
			<main className="mx-auto max-w-2xl px-6 py-20" data-testid="privacy-page">
				<h1 className="font-display text-5xl tracking-tight">Privacy</h1>
				<p className="mt-4 text-lg text-muted-foreground">
					Your email stays with your email provider. Postscript is a window onto it, not a copy of it. Here is exactly what we keep and what we don't.
				</p>

				<Block title="We never store your email content">
					<p>
						The text of your emails and their attachments are never saved in our database or on our disks. When you open a message, we fetch it from
						Gmail or your IMAP server at that moment and show it to you.
					</p>
					<p>
						To make reading fast, an opened message may sit in a short-lived cache for up to 1 hour. That cache is encrypted, and it is cleared when you
						sign out or disconnect the mailbox.
					</p>
					<p>Search is done by your provider (Gmail search or IMAP search). We do not build our own search index of your mail.</p>
				</Block>

				<Block title="What we do keep">
					<p>To show your inbox list, group conversations and keep things in sync, we keep a small amount of information about each message:</p>
					<ul className="list-disc space-y-1 pl-5">
						<li>Message and conversation IDs from your provider, folders and labels</li>
						<li>Flags like read, starred, and whether it has attachments</li>
						<li>The date and size</li>
						<li>Sender, recipients, subject and a short preview, which are encrypted with a key unique to your workspace</li>
					</ul>
					<p>We also keep your account details (name, email, password stored as a one-way hash), your workspaces and your plan.</p>
				</Block>

				<Block title="AI">
					<p>
						AI only runs when it is needed, for example when you open a conversation or ask for a summary. Only that message is sent to the AI
						provider. We never log the prompt or the email text. We store only the result (like a summary, a to-do or a code), and it is encrypted.
					</p>
					<p>
						The AI provider used on this server is <strong data-testid="ai-provider">{ai}</strong>. Where a provider lets us ask it not to keep data, we do.
					</p>
				</Block>

				<Block title="Passwords and tokens">
					<p>
						Gmail access tokens and IMAP or SMTP passwords are encrypted before they are stored. They are never sent back to your browser and never written
						to logs. Our logs leave out email addresses, subjects and message text.
					</p>
				</Block>

				<Block title="Deleting and exporting">
					<p>Disconnecting a mailbox deletes everything we stored for it at once: message details, AI results and the cache.</p>
					<p>Deleting your account deletes all of your data. You can download everything we store about you any time from Settings, Account.</p>
				</Block>

				<Block title="Questions">
					<p>Write to the address on our website and a real person will answer.</p>
				</Block>
			</main>
			<SiteFooter />
		</div>
	);
}
