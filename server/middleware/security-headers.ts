import { defineEventHandler } from "nitro/h3";

const securityHeaders: Record<string, string> = {
	"x-frame-options": "DENY",
	"x-content-type-options": "nosniff",
	"strict-transport-security": "max-age=31536000; includeSubDomains; preload",
	"content-security-policy":
		"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; connect-src 'self' https: wss:; frame-src 'self'; upgrade-insecure-requests",
	"referrer-policy": "strict-origin-when-cross-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=()",
	"cross-origin-embedder-policy": "unsafe-none",
	"cross-origin-resource-policy": "same-site",
	"cross-origin-opener-policy": "same-origin-allow-popups",
};

export default defineEventHandler((event) => {
	for (const [name, value] of Object.entries(securityHeaders)) {
		event.res.headers.set(name, value);
	}
});
