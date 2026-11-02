DROP INDEX "reminder_logs_sub_date_user_uq";--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD COLUMN "kind" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "snooze_until" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_digest_month" text;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_logs_sub_date_user_kind_uq" ON "reminder_logs" USING btree ("subscription_id","charge_date","user_id","kind");