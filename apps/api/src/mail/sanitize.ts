import sanitizeHtml from "sanitize-html";

export interface SanitizeOptions {
	allowRemoteImages: boolean;
	/** Content-ID (without <>) -> URL to serve the inline part. */
	cidUrls?: Record<string, string>;
}

export interface SanitizedHtml {
	html: string;
	hasRemoteImages: boolean;
}

const BLOCKED_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Make untrusted email HTML safe to show: no scripts, event handlers, forms,
 * iframes, or javascript: URLs. Remote images (tracking pixels) are blocked
 * unless allowed, inline cid: images are mapped to signed attachment URLs.
 * The web app also renders the result in a sandboxed iframe (defence in depth).
 */
export function sanitizeEmailHtml(input: string, opts: SanitizeOptions): SanitizedHtml {
	let hasRemoteImages = false;
	const cid = opts.cidUrls ?? {};

	const html = sanitizeHtml(input, {
		allowedTags: [
			...sanitizeHtml.defaults.allowedTags,
			"img",
			"style",
			"center",
			"font",
			"span",
			"div",
			"table",
			"thead",
			"tbody",
			"tfoot",
			"tr",
			"td",
			"th",
			"col",
			"colgroup",
			"caption",
			"u",
			"s",
			"strike",
			"hr",
			"sup",
			"sub",
		],
		disallowedTagsMode: "discard",
		allowedAttributes: {
			"*": [
				"style",
				"class",
				"align",
				"valign",
				"width",
				"height",
				"bgcolor",
				"border",
				"cellpadding",
				"cellspacing",
				"dir",
				"lang",
				"title",
				"colspan",
				"rowspan",
				"color",
				"face",
				"size",
			],
			a: ["href", "name", "target", "rel"],
			img: ["src", "alt", "width", "height", "data-remote-src"],
		},
		allowedSchemes: ["http", "https", "mailto", "tel", "data", "cid"],
		allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
		allowedSchemesAppliedToAttributes: ["href", "src"],
		allowProtocolRelative: false,
		// <style> blocks are kept for layout; the sandbox has no scripts.
		allowVulnerableTags: true,
		transformTags: {
			a: (tagName, attribs) => ({
				tagName,
				attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
			}),
			img: (tagName, attribs) => {
				const src = attribs.src ?? "";
				if (src.toLowerCase().startsWith("cid:")) {
					const id = src.slice(4).replace(/^<|>$/g, "");
					return { tagName, attribs: { ...attribs, src: cid[id] ?? BLOCKED_IMG } };
				}
				if (/^https?:/i.test(src) || src.startsWith("//")) {
					hasRemoteImages = true;
					if (!opts.allowRemoteImages) {
						return { tagName, attribs: { ...attribs, src: BLOCKED_IMG, "data-remote-src": src } };
					}
				}
				return { tagName, attribs };
			},
		},
		exclusiveFilter: (frame) => frame.tag === "style" && /@import|expression\(|javascript:/i.test(frame.text),
	});

	// Background images in inline styles are remote loads too.
	let out = html;
	if (!opts.allowRemoteImages) {
		out = out.replace(/url\(\s*(['"]?)(https?:)?\/\/[^)]*\)/gi, () => {
			hasRemoteImages = true;
			return "none";
		});
	}
	return { html: out, hasRemoteImages };
}
