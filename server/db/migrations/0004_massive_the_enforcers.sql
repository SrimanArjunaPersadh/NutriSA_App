CREATE TYPE "public"."chat_message_status" AS ENUM('complete', 'cut_off', 'failed');--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "status" "chat_message_status" DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "proposal" jsonb;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "unsourced_numbers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "ai_consent_at" timestamp with time zone;