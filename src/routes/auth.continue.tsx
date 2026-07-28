import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { refreshAccessToken } from "@/lib/api-client";

export const Route = createFileRoute("/auth/continue")({
	component: AuthContinuePage,
});

/**
 * Landing point after the Google OAuth callback set the refresh cookie.
 * Exchange it for an in-memory access token, then route into the app.
 */
function AuthContinuePage() {
	const navigate = useNavigate();
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		refreshAccessToken().then((token) => {
			navigate({ to: token ? "/app" : "/login" });
		});
	}, [navigate]);

	return (
		<AuthShell>
			<div className="flex flex-col items-center text-center">
				<Spinner className="mb-4 h-6 w-6" />
				<p className="text-sm text-muted-foreground">Signing you in…</p>
			</div>
		</AuthShell>
	);
}
