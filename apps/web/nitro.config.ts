import { defineNitroConfig } from "nitro/config";

// The browser talks to apps/api on its own origin, so CSP must allow it.
// Read at build time (VITE_API_URL is a build arg in Docker).
const apiUrl = process.env.VITE_API_URL || "http://localhost:3001";
const apiOrigin = (() => {
	try {
		return new URL(apiUrl).origin;
	} catch {
		return "";
	}
})();
const insecure = apiUrl.startsWith("http://");

const csp = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-ancestors 'none'",
	`form-action 'self' ${apiOrigin}`,
	"img-src 'self' data: blob: https: http:",
	"font-src 'self' data: https:",
	"style-src 'self' 'unsafe-inline' https:",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
	`connect-src 'self' ${apiOrigin} https: wss:`,
	"frame-src 'self' about: blob:",
	...(insecure ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const headers: Record<string, string> = {
	"x-frame-options": "DENY",
	"x-content-type-options": "nosniff",
	"content-security-policy": csp,
	"referrer-policy": "strict-origin-when-cross-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=()",
	"cross-origin-opener-policy": "same-origin-allow-popups",
};
if (!insecure) headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";

export default defineNitroConfig({
	routeRules: { "/**": { headers } },
});
