ALTER TYPE "public"."mailbox_provider" ADD VALUE 'imap';--> statement-breakpoint
ALTER TABLE "mailboxes" ALTER COLUMN "access_token_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "imap_host" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "imap_port" integer;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "smtp_host" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "smtp_port" integer;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "use_tls" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "password_enc" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "imap_uid_validity" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "imap_last_uid" integer;