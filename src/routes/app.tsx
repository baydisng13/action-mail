import {
	createFileRoute,
	Link,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { Inbox, ListChecks, LogOut, Menu, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Wordmark } from "@/features/auth/components/wordmark";
import { useLogout, useMe } from "@/features/auth/hooks";
import { useSessionBootstrap } from "@/features/auth/use-session";
import { SyncBanner } from "@/features/mailbox/components/sync-banner";
import { useMailboxes, useRefreshMailbox } from "@/features/mailbox/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({
	component: AppLayout,
});

/** Authenticated app shell: guards, sidebar (desktop) / drawer (mobile), Outlet. */
function AppLayout() {
	const navigate = useNavigate();
	const logout = useLogout();
	const { ready, authed } = useSessionBootstrap();
	const [menuOpen, setMenuOpen] = useState(false);

	const me = useMe({ enabled: authed });
	const mailboxes = useMailboxes({ enabled: authed });
	const refresh = useRefreshMailbox();
	const readyMailbox = mailboxes.data?.find((m) => m.status === "ready");
	const mailbox = mailboxes.data?.[0];

	useEffect(() => {
		if (!readyMailbox) return;
		const id = readyMailbox.id;
		const pull = () => refresh.mutate(id);
		pull();
		window.addEventListener("focus", pull);
		return () => window.removeEventListener("focus", pull);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [readyMailbox?.id]);

	useEffect(() => {
		if (ready && !authed) navigate({ to: "/login" });
	}, [ready, authed, navigate]);
	useEffect(() => {
		if (me.isError) navigate({ to: "/login" });
	}, [me.isError, navigate]);
	useEffect(() => {
		if (mailboxes.data && mailboxes.data.length === 0) {
			navigate({ to: "/onboarding" });
		}
	}, [mailboxes.data, navigate]);

	if (!ready || me.isLoading || !me.data) {
		return (
			<div className="dark flex min-h-svh items-center justify-center bg-background text-foreground">
				<Spinner className="h-6 w-6" />
			</div>
		);
	}

	const { user } = me.data;
	const signOut = async () => {
		await logout.mutateAsync();
		navigate({ to: "/login" });
	};

	return (
		<div className="dark flex h-svh overflow-hidden bg-background text-foreground">
			{/* Desktop sidebar */}
			<aside className="hidden w-60 shrink-0 flex-col border-r border-white/5 bg-white/[0.015] p-4 md:flex">
				<div className="px-2 py-3">
					<Wordmark to="/app" className="text-xl" />
				</div>
				<NavLinks className="mt-4" />
				<UserFooter
					fullName={user.fullName}
					email={user.email}
					onSignOut={signOut}
				/>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				{/* Mobile top bar */}
				<header className="flex h-14 items-center justify-between border-b border-white/5 px-4 md:hidden">
					<Wordmark to="/app" className="text-lg" />
					<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
						<SheetTrigger asChild>
							<button
								type="button"
								aria-label="Open menu"
								className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
							>
								<Menu className="h-5 w-5" />
							</button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="dark flex w-72 flex-col border-white/10 bg-background p-4 text-foreground"
						>
							<SheetTitle className="px-2 py-3">
								<Wordmark to="/app" className="text-xl" />
							</SheetTitle>
							<NavLinks className="mt-2" onNavigate={() => setMenuOpen(false)} />
							<UserFooter
								fullName={user.fullName}
								email={user.email}
								onSignOut={async () => {
									setMenuOpen(false);
									await signOut();
								}}
							/>
						</SheetContent>
					</Sheet>
				</header>

				<SyncBanner mailboxId={mailbox?.id} />
				<div className="min-h-0 flex-1">
					<Outlet />
				</div>
			</div>
		</div>
	);
}

function NavLinks({
	className,
	onNavigate,
}: {
	className?: string;
	onNavigate?: () => void;
}) {
	return (
		<nav className={cn("flex flex-col gap-1", className)}>
			<NavItem
				to="/app"
				icon={<Inbox className="h-4 w-4" />}
				label="Inbox"
				onNavigate={onNavigate}
			/>
			<NavItem
				to="/app/todos"
				icon={<ListChecks className="h-4 w-4" />}
				label="To-do"
				onNavigate={onNavigate}
			/>
			<NavItem
				to="/app/settings"
				icon={<Settings className="h-4 w-4" />}
				label="Settings"
				onNavigate={onNavigate}
			/>
		</nav>
	);
}

function NavItem({
	to,
	icon,
	label,
	onNavigate,
}: {
	to: string;
	icon: React.ReactNode;
	label: string;
	onNavigate?: () => void;
}) {
	return (
		<Link
			to={to}
			onClick={onNavigate}
			activeOptions={{ exact: to === "/app" }}
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors",
				"hover:bg-white/5 hover:text-foreground",
				"data-[status=active]:bg-primary/10 data-[status=active]:font-medium data-[status=active]:text-primary",
			)}
		>
			{icon}
			{label}
		</Link>
	);
}

function UserFooter({
	fullName,
	email,
	onSignOut,
}: {
	fullName: string;
	email: string;
	onSignOut: () => void;
}) {
	const initials = fullName
		.split(" ")
		.map((p) => p[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return (
		<div className="mt-auto border-t border-white/5 pt-3">
			<div className="flex items-center gap-3 px-2 py-2">
				<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
					{initials}
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium">{fullName}</div>
					<div className="truncate text-xs text-muted-foreground">{email}</div>
				</div>
			</div>
			<button
				type="button"
				onClick={onSignOut}
				className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
			>
				<LogOut className="h-4 w-4" />
				Sign out
			</button>
		</div>
	);
}
