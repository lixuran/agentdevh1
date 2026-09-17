CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" "citext";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "currency" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_currency_non_negative" CHECK ("users"."currency" >= 0);
