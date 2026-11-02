ALTER TABLE "subscriptions" ADD COLUMN "source" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;