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

/** Common provider presets to prefill the connect form. */
export const IMAP_PRESETS: Record<
	string,
	{ label: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }
> = {
	zoho: { label: "Zoho", imapHost: "imap.zoho.com", imapPort: 993, smtpHost: "smtp.zoho.com", smtpPort: 465 },
	outlook: { label: "Outlook / Office 365", imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
	yahoo: { label: "Yahoo", imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465 },
	icloud: { label: "iCloud", imapHost: "imap.mail.me.com", imapPort: 993, smtpHost: "smtp.mail.me.com", smtpPort: 587 },
	custom: { label: "Other / cPanel", imapHost: "", imapPort: 993, smtpHost: "", smtpPort: 465 },
};
