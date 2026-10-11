import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "../src/mail/sanitize";

describe("sanitizeEmailHtml", () => {
	it("removes scripts, handlers, forms, iframes and javascript: links", () => {
		const { html } = sanitizeEmailHtml(
			`<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="https://e.vil"></iframe><form action="https://e.vil"><input></form><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">`,
			{ allowRemoteImages: true },
		);
		expect(html).not.toMatch(/script|onclick|onerror|iframe|<form|<input|javascript:/i);
		expect(html).toContain("<p>Hi</p>");
	});

	it("blocks remote images (tracking pixels) unless allowed", () => {
		const input = `<img src="https://track.example/p.gif"><div style="background:url(https://track.example/bg.png)">x</div>`;
		const blocked = sanitizeEmailHtml(input, { allowRemoteImages: false });
		expect(blocked.hasRemoteImages).toBe(true);
		expect(blocked.html).not.toMatch(/\ssrc="https:\/\/track/);
		expect(blocked.html).toContain('data-remote-src="https://track.example/p.gif"');
		expect(blocked.html).not.toContain("bg.png");
		const allowed = sanitizeEmailHtml(input, { allowRemoteImages: true });
		expect(allowed.html).toContain('src="https://track.example/p.gif"');
	});

	it("maps inline cid: images to signed URLs", () => {
		const { html, hasRemoteImages } = sanitizeEmailHtml(`<img src="cid:logo@x">`, {
			allowRemoteImages: false,
			cidUrls: { "logo@x": "https://api.test/api/attachments/m/a0?sig=1" },
		});
		expect(html).toContain("https://api.test/api/attachments/m/a0?sig=1");
		expect(hasRemoteImages).toBe(false);
	});

	it("opens links in a new tab without referrer", () => {
		const { html } = sanitizeEmailHtml(`<a href="https://ok.example">ok</a>`, { allowRemoteImages: false });
		expect(html).toContain('target="_blank"');
		expect(html).toContain("noopener");
	});
});
