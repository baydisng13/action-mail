import { z } from "zod";

export const imapConnectSchema = z.object({
	emailAddress: z.string().email(),
	imapHost: z.string().min(1, "Required"),
	imapPort: z.number().int().min(1).max(65535),
	smtpHost: z.string().min(1, "Required"),
	smtpPort: z.number().int().min(1).max(65535),
	useTls: z.boolean(),
	username: z.string().min(1, "Required"),
	password: z.string().min(1, "Required"),
});

export type ImapConnectInput = z.infer<typeof imapConnectSchema>;

export interface ProviderPreset {
	id: string;
	label: string;
	imapHost: string;
	imapPort: number;
	smtpHost: string;
	smtpPort: number;
	/** Provider-specific setup guidance shown in the connect form. */
	help: string;
	/** Link to the provider's IMAP / app-password docs. */
	docsUrl?: string;
}

/** Per-provider integrations: correct hosts + how to get a working password. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		id: "zoho-com",
		label: "Zoho (US)",
		imapHost: "imap.zoho.com",
		imapPort: 993,
		smtpHost: "smtp.zoho.com",
		smtpPort: 465,
		help: "Enable IMAP in Zoho Mail → Settings → Mail Accounts → IMAP Access. If 2FA is on, create an app password (Zoho Accounts → Security → App Passwords).",
		docsUrl: "https://www.zoho.com/mail/help/imap-access.html",
	},
	{
		id: "zoho-eu",
		label: "Zoho (EU)",
		imapHost: "imap.zoho.eu",
		imapPort: 993,
		smtpHost: "smtp.zoho.eu",
		smtpPort: 465,
		help: "EU data center. Enable IMAP + use an app password if 2FA is on.",
		docsUrl: "https://www.zoho.com/mail/help/imap-access.html",
	},
	{
		id: "zoho-in",
		label: "Zoho (India)",
		imapHost: "imap.zoho.in",
		imapPort: 993,
		smtpHost: "smtp.zoho.in",
		smtpPort: 465,
		help: "India data center. Enable IMAP + use an app password if 2FA is on.",
		docsUrl: "https://www.zoho.com/mail/help/imap-access.html",
	},
	{
		id: "gmail",
		label: "Gmail (app password)",
		imapHost: "imap.gmail.com",
		imapPort: 993,
		smtpHost: "smtp.gmail.com",
		smtpPort: 465,
		help: "Prefer 'Connect Gmail' (OAuth) above. For IMAP you must enable 2-Step Verification and create an App Password.",
		docsUrl: "https://support.google.com/mail/answer/185833",
	},
	{
		id: "outlook",
		label: "Outlook / Microsoft 365",
		imapHost: "outlook.office365.com",
		imapPort: 993,
		smtpHost: "smtp.office365.com",
		smtpPort: 587,
		help: "IMAP must be enabled (personal accounts: on by default; work/school: ask your admin). With 2FA, create an app password.",
		docsUrl:
			"https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040",
	},
	{
		id: "yahoo",
		label: "Yahoo",
		imapHost: "imap.mail.yahoo.com",
		imapPort: 993,
		smtpHost: "smtp.mail.yahoo.com",
		smtpPort: 465,
		help: "Yahoo requires an app password: Account Security → Generate app password.",
		docsUrl: "https://help.yahoo.com/kb/SLN15241.html",
	},
	{
		id: "icloud",
		label: "iCloud",
		imapHost: "imap.mail.me.com",
		imapPort: 993,
		smtpHost: "smtp.mail.me.com",
		smtpPort: 587,
		help: "iCloud requires an app-specific password: appleid.apple.com → Sign-In & Security → App-Specific Passwords.",
		docsUrl: "https://support.apple.com/en-us/102654",
	},
	{
		id: "fastmail",
		label: "Fastmail",
		imapHost: "imap.fastmail.com",
		imapPort: 993,
		smtpHost: "smtp.fastmail.com",
		smtpPort: 465,
		help: "Create an app password: Settings → Privacy & Security → App Passwords.",
		docsUrl: "https://www.fastmail.help/hc/en-us/articles/1500000278342",
	},
	{
		id: "custom",
		label: "Other / cPanel / IMAP",
		imapHost: "",
		imapPort: 993,
		smtpHost: "",
		smtpPort: 465,
		help: "Enter your host's IMAP + SMTP settings. cPanel: Email Accounts → Connect Devices shows the exact values.",
	},
];
