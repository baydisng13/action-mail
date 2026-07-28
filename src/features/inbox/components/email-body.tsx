import { useEffect, useRef, useState } from "react";

const READER_CSS = `
	html,body{margin:0;padding:0}
	body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#1a1a1a;background:#fff;padding:20px;word-wrap:break-word}
	img{max-width:100%;height:auto}
	a{color:#1364d6}
	table{max-width:100%!important}
	*{max-width:100%}
`;
const ORIGINAL_CSS = `html,body{margin:0}img{max-width:100%;height:auto}`;

/**
 * Renders untrusted email HTML in a sandboxed iframe — scripts can't run (no
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
	}, []);

	return (
		<iframe
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
