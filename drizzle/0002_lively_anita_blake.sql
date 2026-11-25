CREATE TABLE "daily_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"submissions_completed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_activities_xp_nonnegative_ck" CHECK ("daily_activities"."xp_earned" >= 0),
	CONSTRAINT "daily_activities_submissions_nonnegative_ck" CHECK ("daily_activities"."submissions_completed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "learning_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"daily_xp_goal" integer DEFAULT 20 NOT NULL,
	"timezone" varchar(80) DEFAULT 'Asia/Jakarta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_preferences_daily_goal_range_ck" CHECK ("learning_preferences"."daily_xp_goal" BETWEEN 10 AND 100)
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_code" varchar(60) NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_progress_xp_nonnegative_ck" CHECK ("user_progress"."total_xp" >= 0),
	CONSTRAINT "user_progress_level_positive_ck" CHECK ("user_progress"."level" >= 1),
	CONSTRAINT "user_progress_streak_nonnegative_ck" CHECK ("user_progress"."current_streak" >= 0 AND "user_progress"."longest_streak" >= 0)
);
--> statement-breakpoint
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_preferences" ADD CONSTRAINT "learning_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_activities_user_date_uq" ON "daily_activities" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE INDEX "daily_activities_user_date_idx" ON "daily_activities" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_user_code_uq" ON "user_achievements" USING btree ("user_id","achievement_code");--> statement-breakpoint
CREATE INDEX "user_achievements_user_unlocked_idx" ON "user_achievements" USING btree ("user_id","unlocked_at");