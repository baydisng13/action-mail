CREATE TYPE "public"."mailbox_provider" AS ENUM('gmail');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'syncing', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"provider" "mailbox_provider" DEFAULT 'gmail' NOT NULL,
	"email_address" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"scope" text,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"synced_count" integer DEFAULT 0 NOT NULL,
	"total_estimate" integer,
	"backfill_page_token" text,
	"history_id" text,
	"last_synced_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"mailbox_id" text NOT NULL,
	"thread_id" text,
	"provider_message_id" text NOT NULL,
	"from_address" text,
	"from_name" text,
	"to_addresses" jsonb,
	"subject" text,
	"snippet" text,
	"body_text" text,
	"labels" jsonb,
	"is_unread" boolean DEFAULT false NOT NULL,
	"internal_date" timestamp with time zone,
	"journal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"mailbox_id" text NOT NULL,
	"provider_thread_id" text NOT NULL,
	"subject" text,
	"snippet" text,
	"last_message_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"ai_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_user_provider_email_idx" ON "mailboxes" USING btree ("user_id","provider","email_address");--> statement-breakpoint
CREATE INDEX "mailbox_user_idx" ON "mailboxes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mailbox_team_idx" ON "mailboxes" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_mailbox_provider_idx" ON "messages" USING btree ("mailbox_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "message_mailbox_date_idx" ON "messages" USING btree ("mailbox_id","internal_date");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_mailbox_provider_idx" ON "threads" USING btree ("mailbox_id","provider_thread_id");--> statement-breakpoint
CREATE INDEX "thread_mailbox_last_msg_idx" ON "threads" USING btree ("mailbox_id","last_message_at");