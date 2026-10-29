CREATE TYPE "public"."category" AS ENUM('VIDEO', 'MUSIC', 'ECOSYSTEM', 'BANK', 'CLOUD', 'SHOPPING', 'EDUCATION', 'GAMES', 'CONNECTION', 'SPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."period_unit" AS ENUM('WEEK', 'MONTH', 'YEAR');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "reminder_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"charge_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "category" NOT NULL,
	"default_price_kopecks" integer,
	"period_unit" "period_unit" DEFAULT 'MONTH' NOT NULL,
	"period_count" integer DEFAULT 1 NOT NULL,
	"color" text DEFAULT '#6C7A89' NOT NULL,
	"cancel_url" text,
	"cancel_steps" text,
	"search_aliases" text,
	"is_popular" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"service_id" integer,
	"custom_name" text,
	"price_kopecks" integer NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"period_unit" "period_unit" DEFAULT 'MONTH' NOT NULL,
	"period_count" integer DEFAULT 1 NOT NULL,
	"next_charge_date" date NOT NULL,
	"anchor_day" integer NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"remind_days_before" integer DEFAULT 1 NOT NULL,
	"status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"first_name" text,
	"username" text,
	"language_code" text,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"reminder_hour" integer DEFAULT 10 NOT NULL,
	"bot_blocked" boolean DEFAULT false NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_logs_sub_date_uq" ON "reminder_logs" USING btree ("subscription_id","charge_date");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_status_date_idx" ON "subscriptions" USING btree ("status","next_charge_date");