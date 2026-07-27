import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	const router = createRouter({
		routeTree,
		context: { ...rqContext },
		defaultPreload: "intent",
		defaultNotFoundComponent: () => (
			<div className="flex min-h-[40vh] items-center justify-center p-6">
				<div className="text-center">
					<h2 className="text-lg font-semibold">Page not found</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						The page you are looking for does not exist.
					</p>
				</div>
			</div>
		),
		Wrap: (props: { children: React.ReactNode }) => {
			return (
				<TanstackQuery.Provider {...rqContext}>
					{props.children}
				</TanstackQuery.Provider>
			);
		},
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	});

	return router;
};
