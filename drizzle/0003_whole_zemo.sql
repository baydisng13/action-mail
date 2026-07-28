CREATE TYPE "public"."todo_source" AS ENUM('ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TABLE "todos" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text,
	"title" text NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone,
	"status" "todo_status" DEFAULT 'open' NOT NULL,
	"source" "todo_source" DEFAULT 'manual' NOT NULL,
	"message_id" text,
	"thread_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todo_user_status_idx" ON "todos" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "todo_user_due_idx" ON "todos" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "todo_user_message_idx" ON "todos" USING btree ("user_id","message_id");