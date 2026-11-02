CREATE TABLE "member_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"charge_date" date NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "reminder_logs_sub_date_uq";--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
-- Старые напоминания отправлялись владельцу подписки
UPDATE "reminder_logs" SET "user_id" = s."user_id" FROM "subscriptions" s WHERE s."id" = "reminder_logs"."subscription_id";--> statement-breakpoint
ALTER TABLE "reminder_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_member_id_subscription_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."subscription_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_members" ADD CONSTRAINT "subscription_members_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_members" ADD CONSTRAINT "subscription_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_payments_member_date_uq" ON "member_payments" USING btree ("member_id","charge_date");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_members_sub_user_uq" ON "subscription_members" USING btree ("subscription_id","user_id");--> statement-breakpoint
CREATE INDEX "subscription_members_user_idx" ON "subscription_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_logs_sub_date_user_uq" ON "reminder_logs" USING btree ("subscription_id","charge_date","user_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_share_token_unique" UNIQUE("share_token");