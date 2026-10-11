import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Client-safe env. Only `VITE_`-prefixed vars are exposed to the browser. */
export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_APP_TITLE: z.string().min(1).optional(),
		/** Public URL of apps/api, e.g. https://api.postscript.cool.tutto.et */
		VITE_API_URL: z.string().optional(),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});

export const API_URL = (env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
export const APP_TITLE = env.VITE_APP_TITLE ?? "Postscript";
