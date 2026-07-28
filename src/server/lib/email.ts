import { serverEnv } from "@/env.server";

export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
}

export interface EmailService {
	send(msg: EmailMessage): Promise<void>;
}

/** Dev fallback: logs the message (and any link) to the server console. */
class ConsoleEmailService implements EmailService {
	async send(msg: EmailMessage): Promise<void> {
		console.info(
			`\n📧 [email:dev] to=${msg.to}\n   subject: ${msg.subject}\n   ${msg.text}\n`,
		);
	}
}

/** Production: Resend HTTP API (no SDK dependency needed). */
class ResendEmailService implements EmailService {
	constructor(
		private apiKey: string,
		private from: string,
	) {}

	async send(msg: EmailMessage): Promise<void> {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				authorization: `Bearer ${this.apiKey}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				from: this.from,
				to: msg.to,
				subject: msg.subject,
				html: msg.html,
				text: msg.text,
			}),
		});
		if (!res.ok) {
			throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
		}
	}
}

export const email: EmailService = serverEnv.RESEND_API_KEY
	? new ResendEmailService(serverEnv.RESEND_API_KEY, serverEnv.EMAIL_FROM)
	: new ConsoleEmailService();

// ─── Templates ──────────────────────────────────────────────────────────────
export function verificationEmail(link: string): Omit<EmailMessage, "to"> {
	return {
		subject: "Verify your Postscript email",
		text: `Welcome to Postscript. Verify your email: ${link}`,
		html: `<p>Welcome to Postscript.</p><p><a href="${link}">Verify your email</a></p><p>This link expires in 24 hours.</p>`,
	};
}

export function passwordResetEmail(link: string): Omit<EmailMessage, "to"> {
	return {
		subject: "Reset your Postscript password",
		text: `Reset your password: ${link}`,
		html: `<p>Reset your password:</p><p><a href="${link}">Choose a new password</a></p><p>This link expires in 1 hour. If you didn't request this, ignore it.</p>`,
	};
}

export function inviteEmail(
	teamName: string,
	link: string,
): Omit<EmailMessage, "to"> {
	return {
		subject: `You've been invited to ${teamName} on Postscript`,
		text: `Join ${teamName}: ${link}`,
		html: `<p>You've been invited to join <strong>${teamName}</strong> on Postscript.</p><p><a href="${link}">Accept invite</a></p>`,
	};
}
