import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { env, features } from "../config/env";
import { log } from "../common/logger";
import type { EmailJob } from "../queue/queues";
import { QueueService } from "../queue/queue.service";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function layout(body: string): string {
	return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:520px">${body}<p style="color:#777;font-size:13px;margin-top:32px">Postscript</p></div>`;
}

export const templates = {
	verify(link: string): Omit<EmailJob, "to"> {
		return {
			subject: "Verify your Postscript email",
			text: `Welcome to Postscript. Verify your email: ${link}`,
			html: layout(`<p>Welcome to Postscript.</p><p><a href="${esc(link)}">Verify your email</a></p><p>This link works for 24 hours.</p>`),
		};
	},
	reset(link: string): Omit<EmailJob, "to"> {
		return {
			subject: "Reset your Postscript password",
			text: `Reset your password: ${link}`,
			html: layout(`<p><a href="${esc(link)}">Choose a new password</a></p><p>This link works for 1 hour. If you did not ask for this, you can ignore it.</p>`),
		};
	},
	invite(orgName: string, inviter: string, link: string): Omit<EmailJob, "to"> {
		return {
			subject: `${inviter} invited you to ${orgName} on Postscript`,
			text: `${inviter} invited you to join ${orgName} on Postscript: ${link}`,
			html: layout(`<p>${esc(inviter)} invited you to join <strong>${esc(orgName)}</strong> on Postscript.</p><p><a href="${esc(link)}">Accept the invite</a></p><p>This invite works for 7 days.</p>`),
		};
	},
};

/** Producer: queue an email for the worker to send (with retries). */
@Injectable()
export class EmailService {
	constructor(private readonly queues: QueueService) {}

	async send(msg: EmailJob): Promise<void> {
		await this.queues.safe("email", () => this.queues.email(msg));
	}
}

/** Consumer side: actually deliver (Resend), or log when not configured. */
export async function deliverEmail(msg: EmailJob): Promise<void> {
	const e = env();
	if (e.EMAIL_OUTBOX_DIR) {
		await mkdir(e.EMAIL_OUTBOX_DIR, { recursive: true });
		const file = join(e.EMAIL_OUTBOX_DIR, `${Date.now()}-${msg.to.replace(/[^a-z0-9@.]/gi, "_")}.json`);
		await writeFile(file, JSON.stringify(msg, null, 2));
	}
	if (!features.email()) {
		log.info("email.not_configured", { to: msg.to, subject: msg.subject, text: msg.text });
		return;
	}
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
		body: JSON.stringify({ from: e.EMAIL_FROM, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
	});
	if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
	log.info("email.sent", { to: msg.to, subject: msg.subject });
}
