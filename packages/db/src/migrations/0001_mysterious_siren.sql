CREATE TABLE "blog_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"cover_image" text,
	"author_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_post_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blog_post_tag" (
	"post_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text DEFAULT '#D4A574',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_tag_name_unique" UNIQUE("name"),
	CONSTRAINT "blog_tag_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "blog_comment" ADD CONSTRAINT "blog_comment_post_id_blog_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_tag" ADD CONSTRAINT "blog_post_tag_post_id_blog_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_tag" ADD CONSTRAINT "blog_post_tag_tag_id_blog_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."blog_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_comment_post_idx" ON "blog_comment" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "blog_comment_status_idx" ON "blog_comment" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_slug_unique" ON "blog_post" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blog_post_status_idx" ON "blog_post" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_post_published_at_idx" ON "blog_post" USING btree ("published_at");