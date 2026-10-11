import { describe, expect, it } from "vitest";
import {
	buildMime,
	cleanMessageId,
	isReplySubject,
	makeSnippet,
	normalizeSubject,
	parseAddressList,
	parseReferences,
	replyAllRecipients,
	threadCandidates,
} from "../src/mail/mime";
import { parseSource } from "../src/mail/body";

describe("subjects and ids", () => {
	it("normalizes reply/forward prefixes in many languages", () => {
		expect(normalizeSubject("Re: Fwd: RE: AW: Hello  world")).toBe("hello world");
		expect(normalizeSubject("Re[2]: Budget")).toBe("budget");
		expect(isReplySubject("Re: x")).toBe(true);
		expect(isReplySubject("Regarding x")).toBe(false);
	});

	it("cleans Message-IDs and parses References", () => {
		expect(cleanMessageId(" <abc@x.com> ")).toBe("abc@x.com");
		expect(parseReferences("<a@x> <b@x>\r\n <c@x>")).toEqual(["a@x", "b@x", "c@x"]);
		expect(parseReferences(undefined)).toEqual([]);
	});

	it("threads replies to the root of the References chain", () => {
		const r = threadCandidates({ messageId: "c@x", inReplyTo: "b@x", references: ["a@x", "b@x"] });
		expect(r.lookups[0]).toBe("a@x");
		expect(r.lookups).toContain("b@x");
		expect(r.fallbackKey).toBe("a@x");
		const lone = threadCandidates({ messageId: "z@x", inReplyTo: null, references: [] });
		expect(lone.lookups).toEqual([]);
		expect(lone.fallbackKey).toBe("z@x");
		const onlyParent = threadCandidates({ messageId: "d@x", inReplyTo: "b@x", references: [] });
		expect(onlyParent.fallbackKey).toBe("b@x");
	});
});

describe("addresses", () => {
	it("parses header address lists with quoted names and commas", () => {
		expect(parseAddressList('"Doe, Jane" <JANE@x.com>, bob@y.org')).toEqual([
			{ name: "Doe, Jane", address: "jane@x.com" },
			{ name: null, address: "bob@y.org" },
		]);
	});

	it("reply-all drops me and dedupes", () => {
		const r = replyAllRecipients({
			me: "me@x.com",
			from: { name: "A", address: "a@x.com" },
			replyTo: null,
			to: [{ name: null, address: "me@x.com" }, { name: null, address: "b@x.com" }],
			cc: [{ name: null, address: "a@x.com" }, { name: null, address: "c@x.com" }],
		});
		expect(r.to).toEqual(["a@x.com", "b@x.com"]);
		expect(r.cc).toEqual(["c@x.com"]);
	});

	it("reply-all to my own sent message goes to the original recipients", () => {
		const r = replyAllRecipients({
			me: "me@x.com",
			from: { name: null, address: "me@x.com" },
			replyTo: null,
			to: [{ name: null, address: "b@x.com" }],
			cc: [],
		});
		expect(r.to).toEqual(["b@x.com"]);
	});
});

describe("snippets and MIME", () => {
	it("builds snippets from text or html, skipping quoted lines", () => {
		expect(makeSnippet("Hi there\n> old stuff\nthanks")).toBe("Hi there thanks");
		expect(makeSnippet("", "<style>p{}</style><p>Hello <b>you</b></p>")).toBe("Hello you");
	});

	it("round-trips a message with reply headers and an attachment", async () => {
		const raw = await buildMime({
			from: { name: "Me", address: "me@x.com" },
			to: ["a@x.com"],
			cc: [],
			bcc: ["secret@x.com"],
			subject: "Re: Plan",
			html: "<p>Sounds good</p>",
			inReplyTo: "root@x.com",
			references: ["root@x.com"],
			attachments: [{ filename: "notes.txt", contentType: "text/plain", content: Buffer.from("hello") }],
			messageId: "new@x.com",
		});
		const s = raw.toString();
		expect(s).toContain("In-Reply-To: <root@x.com>");
		expect(s).not.toContain("secret@x.com"); // Bcc never in the sent headers
		const p = await parseSource(raw);
		expect(p.subject).toBe("Re: Plan");
		expect(p.text).toContain("Sounds good");
		expect(p.attachments[0].filename).toBe("notes.txt");
		expect(p.contents[0].toString()).toBe("hello");
		expect(p.references).toEqual(["root@x.com"]);
	});
});
