import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout for the onboarding flow, its children (index, syncing) render here. */
export const Route = createFileRoute("/onboarding")({
	component: () => <Outlet />,
});
