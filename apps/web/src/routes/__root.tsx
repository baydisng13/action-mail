import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "@/components/ui/sonner";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?inline";
import { TooltipProvider } from "@/components/ui/tooltip";

const SITE_TITLE = "Postscript: the inbox that reads for you";
const SITE_DESCRIPTION =
	"An AI-native email client that extracts the action, not the message.";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: SITE_TITLE },
			{ name: "description", content: SITE_DESCRIPTION },
		],
		links: [
			{ rel: "icon", href: "/favicon.ico" },
			{ rel: "manifest", href: "/manifest.json" },
		],
		// Inlined (not ?url): the SSR and client builds hash ?url assets
		// differently, which shipped an unstyled app from Docker before.
		styles: [{ children: appCss }],
	}),
	component: RootLayout,
});

function RootLayout() {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
			<TooltipProvider>
				<Outlet />
				<Toaster richColors position="top-right" />
				{import.meta.env.DEV && (
					<TanStackDevtools
						config={{ position: "bottom-right" }}
						plugins={[
							{
								name: "Tanstack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
							TanStackQueryDevtools,
						]}
					/>
				)}
				<Scripts />
				</TooltipProvider>
			</body>
		</html>
	);
}
