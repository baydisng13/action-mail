ALTER TABLE "messages" ADD COLUMN "ai_actions" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_processed_at" timestamp with time zone;