import { useEffect, useRef, useState } from "react";

// Reader: strip the sender's design (backgrounds, colors, multi-column table
// layouts, custom fonts) down to a clean single-column read, but keep images
// and links working.
const READER_CSS = `
	html,body{margin:0!important;padding:0!important;background:#fff!important}
	body{max-width:640px;margin:0 auto!important;padding:24px!important;
		font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif!important;
		color:#1a1a1a!important;word-break:break-word}
	*{max-width:100%!important;background-image:none!important;background-color:transparent!important;
		color:inherit!important;font-family:inherit!important;float:none!important;
		box-sizing:border-box!important;border-radius:0!important}
	/* Linearise table-based layouts into one column */
	table,tbody,thead,tr,td,th{display:block!important;width:auto!important;max-width:100%!important;
		height:auto!important;border:0!important;padding:0!important}
	img{height:auto!important;margin:8px 0}
	h1,h2,h3{line-height:1.3!important;margin:1.2em 0 .4em}
	h1{font-size:1.5em!important}h2{font-size:1.3em!important}h3{font-size:1.1em!important}
	p,div,td{margin:0 0 .6em}
	a{color:#1364d6!important;text-decoration:underline}
	hr{border:0;border-top:1px solid #e5e5e5;margin:1.2em 0}
	[style*="display:none"],[style*="display: none"]{display:none!important}
`;
const ORIGINAL_CSS = `html,body{margin:0;padding:12px;background:#fff;color:#1a1a1a;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;word-break:break-word}img{max-width:100%;height:auto}blockquote{margin:0 0 0 .5em;padding-left:.8em;border-left:2px solid #ddd;color:#555}`;

/**
 * Renders untrusted email HTML in a sandboxed iframe, scripts can't run (no
 * `allow-scripts`), so it's XSS-safe, while images and links still work.
 * Auto-sizes to content. `reader` mode applies clean typography; `original`
 * keeps the sender's markup as-is.
 */
export function EmailBody({
	html,
	mode,
}: {
	html: string;
	mode: "reader" | "original";
}) {
	const ref = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(160);

	const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="referrer" content="no-referrer"><style>${mode === "reader" ? READER_CSS : ORIGINAL_CSS}</style></head><body>${html}</body></html>`;

	useEffect(() => {
		const iframe = ref.current;
		if (!iframe) return;
		const measure = () => {
			try {
				const doc = iframe.contentWindow?.document;
				if (doc) setHeight(doc.body.scrollHeight + 24);
			} catch {
				/* cross-origin guard */
			}
		};
		const t1 = setTimeout(measure, 100);
		const t2 = setTimeout(measure, 700); // catch late-loading images
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
		};
	}, [html, mode]);

	return (
		<iframe
			data-testid="email-body"
			ref={ref}
			title="Email content"
			srcDoc={srcDoc}
			sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
			onLoad={() => {
				try {
					const doc = ref.current?.contentWindow?.document;
					if (doc) setHeight(doc.body.scrollHeight + 24);
				} catch {
					/* ignore */
				}
			}}
			className="w-full rounded-lg bg-white"
			style={{ height }}
		/>
	);
}
