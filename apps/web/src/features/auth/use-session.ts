import { useEffect, useState } from "react";
import { refreshAccessToken } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-token";

/**
 * On mount, ensure we have an access token, trying the refresh cookie once
 * for fresh tabs. Returns `ready` (bootstrap finished) and whether a session
 * exists. Route guards use this to redirect unauthenticated users.
 */
export function useSessionBootstrap(): { ready: boolean; authed: boolean } {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let active = true;
		(async () => {
			if (!getAccessToken()) await refreshAccessToken();
			if (active) setReady(true);
		})();
		return () => {
			active = false;
		};
	}, []);

	return { ready, authed: ready && Boolean(getAccessToken()) };
}
