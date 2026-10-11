import type { FolderView, MeResponse } from "@postscript/types";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { ListChecks, LogOut, Menu, PenSquare, Settings, Shield, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Wordmark } from "@/features/auth/components/wordmark";
import { useLogout, useMe } from "@/features/auth/hooks";
import { useSessionBootstrap } from "@/features/auth/use-session";
import { UpgradeDialogHost } from "@/features/billing/components/upgrade-dialog";
import { ComposeProvider, useCompose } from "@/features/mail/compose/compose-context";
import { ComposeHost } from "@/features/mail/compose/compose-window";
import { useFolders } from "@/features/mail/hooks";
import { VIEW_META } from "@/features/mail/views";
import { SyncBanner } from "@/features/mailbox/components/sync-banner";
import { useMailboxes } from "@/features/mailbox/hooks";
import { WorkspaceSwitcher } from "@/features/orgs/components/workspace-switcher";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({
	component: AppLayout,
});

/** Authenticated shell: session guard, sidebar (desktop) / drawer (mobile), compose. */
function AppLayout() {
	const navigate = useNavigate();
	const { ready, authed } = useSessionBootstrap();
	const me = useMe({ enabled: authed });
	const mailboxes = useMailboxes({ enabled: authed });

	useEffect(() => {
		if (ready && !authed) navigate({ to: "/login", search: { redirect: window.location.pathname + window.location.search } });
	}, [ready, authed, navigate]);
	useEffect(() => {
		if (me.isError) navigate({ to: "/login" });
	}, [me.isError, navigate]);
	useEffect(() => {
		const path = window.location.pathname;
		if (mailboxes.data && mailboxes.data.length === 0 && (path === "/app" || path === "/app/")) {
			navigate({ to: "/onboarding" });
		}
	}, [mailboxes.data, navigate]);

	if (!ready || !me.data) {
		return (
			<div className="dark flex min-h-svh items-center justify-center bg-background text-foreground">
				<Spinner className="h-6 w-6" />
			</div>
		);
	}

	return (
		<ComposeProvider>
			<Shell me={me.data} />
		</ComposeProvider>
	);
}

function Shell({ me }: { me: MeResponse }) {
	const [menuOpen, setMenuOpen] = useState(false);
	return (
		<div className="dark flex h-svh overflow-hidden bg-background text-foreground">
			<aside className="hidden w-64 shrink-0 flex-col bg-white/[0.015] md:flex" data-testid="sidebar">
				<Sidebar me={me} />
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-12 items-center justify-between px-3 md:hidden">
					<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
						<SheetTrigger asChild>
							<button type="button" aria-label="Open menu" data-testid="mobile-menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground">
								<Menu className="h-5 w-5" />
							</button>
						</SheetTrigger>
						<SheetContent side="left" className="dark flex w-72 flex-col border-0 bg-background p-0 text-foreground">
							<SheetTitle className="sr-only">Menu</SheetTitle>
							<Sidebar me={me} onNavigate={() => setMenuOpen(false)} />
						</SheetContent>
					</Sheet>
					<Wordmark to="/app" className="text-lg" />
					<MobileCompose />
				</header>

				{me.activeOrg.suspended && (
					<div className="bg-destructive/15 px-4 py-2 text-sm" data-testid="suspended-banner">
						This workspace is suspended. Mail and AI are paused. Contact support or check billing.
					</div>
				)}
				<SyncBanner />
				<div className="min-h-0 flex-1">
					<Outlet />
				</div>
			</div>
			<ComposeHost />
			<UpgradeDialogHost />
		</div>
	);
}

function MobileCompose() {
	const compose = useCompose();
	return (
		<button type="button" aria-label="Compose" onClick={() => compose.open({ mode: "new" })} className="flex h-9 w-9 items-center justify-center rounded-lg text-primary hover:bg-white/5">
			<PenSquare className="h-5 w-5" />
		</button>
	);
}

function Sidebar({ me, onNavigate }: { me: MeResponse; onNavigate?: () => void }) {
	const navigate = useNavigate();
	const logout = useLogout();
	const compose = useCompose();
	const search = useSearch({ strict: false }) as { view?: string; mailbox?: string; label?: string };
	const mailboxes = useMailboxes();
	const folders = useFolders(search.mailbox);
	const pathname = useRouterState({ select: (st) => st.location.pathname });
	const onMail = /^\/app\/?$/.test(pathname);
	const view = search.view ?? "inbox";

	const unreadByRole = useMemo(() => {
		const m = new Map<string, number>();
		for (const f of folders.data ?? []) {
			if (search.mailbox && f.mailboxId !== search.mailbox) continue;
			m.set(f.role, (m.get(f.role) ?? 0) + f.unread);
		}
		return m;
	}, [folders.data, search.mailbox]);

	const labels: FolderView[] = (folders.data ?? []).filter((f) => f.role === "custom" && (!search.mailbox || f.mailboxId === search.mailbox));

	const signOut = async () => {
		await logout.mutateAsync().catch(() => undefined);
		navigate({ to: "/login" });
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col p-3">
			<WorkspaceSwitcher me={me} />

			<button
				type="button"
				data-testid="compose-button"
				onClick={() => {
					compose.open({ mode: "new", mailboxId: search.mailbox });
					onNavigate?.();
				}}
				className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				<PenSquare className="h-4 w-4" />
				Compose
			</button>

			<div className="mt-3 min-h-0 flex-1 overflow-y-auto">
				{(mailboxes.data?.length ?? 0) > 1 && (
					<select
						aria-label="Mailbox"
						data-testid="mailbox-select"
						value={search.mailbox ?? ""}
						onChange={(e) => {
							navigate({ to: "/app", search: { view: view as never, mailbox: e.target.value || undefined } });
							onNavigate?.();
						}}
						className="mb-2 w-full rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-sm outline-none"
					>
						<option value="" className="bg-neutral-900">All inboxes</option>
						{mailboxes.data?.map((m) => (
							<option key={m.id} value={m.id} className="bg-neutral-900">{m.emailAddress}</option>
						))}
					</select>
				)}
				<nav className="flex flex-col gap-0.5" data-testid="views-nav">
					{VIEW_META.map((v) => {
						const active = onMail && view === v.view && !search.label;
						const count = v.role === "inbox" || v.role === "spam" || v.role === "drafts" ? unreadByRole.get(v.role) ?? 0 : 0;
						return (
							<Link
								key={v.view}
								to="/app"
								search={{ view: v.view, mailbox: search.mailbox }}
								onClick={onNavigate}
								data-testid={`nav-${v.view}`}
								className={cn(
									"flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground",
									active && "bg-primary/10 font-medium text-primary hover:text-primary",
								)}
							>
								<v.icon className="h-4 w-4" />
								<span className="flex-1">{v.label}</span>
								{count > 0 && <span className="text-xs tabular-nums" data-testid={`count-${v.view}`}>{count}</span>}
							</Link>
						);
					})}
				</nav>

				{labels.length > 0 && (
					<>
						<p className="mt-5 mb-1 px-3 text-xs font-medium text-muted-foreground/70">Folders and labels</p>
						<nav className="flex flex-col gap-0.5">
							{labels.map((f) => (
								<Link
									key={f.id}
									to="/app"
									search={{ view: "label", label: f.id, mailbox: search.mailbox }}
									onClick={onNavigate}
									className={cn(
										"flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
										onMail && search.label === f.id && "bg-primary/10 text-primary",
									)}
								>
									<Tag className="h-3.5 w-3.5" />
									<span className="min-w-0 flex-1 truncate">{f.name}</span>
									{f.unread > 0 && <span className="text-xs tabular-nums">{f.unread}</span>}
								</Link>
							))}
						</nav>
					</>
				)}

				<nav className="mt-5 flex flex-col gap-0.5">
					<NavItem to="/app/todos" icon={<ListChecks className="h-4 w-4" />} label="To-do" onNavigate={onNavigate} />
					<NavItem to="/app/settings" icon={<Settings className="h-4 w-4" />} label="Settings" onNavigate={onNavigate} testId="nav-settings" />
					{me.user.isPlatformAdmin && <NavItem to="/app/admin" icon={<Shield className="h-4 w-4" />} label="Admin" onNavigate={onNavigate} testId="nav-admin" />}
				</nav>
			</div>

			<div className="mt-3 flex items-center gap-2.5 px-2 pt-2">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-medium">
					{me.user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm">{me.user.fullName}</div>
					<div className="truncate text-xs text-muted-foreground">{me.user.email}</div>
				</div>
				<button type="button" aria-label="Sign out" title="Sign out" data-testid="sign-out" onClick={signOut} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
					<LogOut className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}

function NavItem({ to, icon, label, onNavigate, testId }: { to: "/app/todos" | "/app/settings" | "/app/admin"; icon: React.ReactNode; label: string; onNavigate?: () => void; testId?: string }) {
	return (
		<Link
			to={to}
			onClick={onNavigate}
			data-testid={testId}
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground",
				"data-[status=active]:bg-primary/10 data-[status=active]:font-medium data-[status=active]:text-primary",
			)}
		>
			{icon}
			{label}
		</Link>
	);
}
