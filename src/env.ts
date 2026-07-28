import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Client-safe env. Only `VITE_`-prefixed vars are exposed to the browser. */
export const env = createEnv({
	clientPrefix: "VITE_",

	client: {
		VITE_APP_TITLE: z.string().min(1).optional(),
		// Base URL the browser talks to. Empty string = same origin (default).
		VITE_API_URL: z.string().optional(),
	},

	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
