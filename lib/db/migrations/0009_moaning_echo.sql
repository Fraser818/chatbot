CREATE TABLE IF NOT EXISTS "agent_file" (
	"agentId" varchar(64) NOT NULL,
	"fileId" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_file_agentId_fileId_pk" PRIMARY KEY("agentId","fileId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_asset" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"filename" varchar(256) NOT NULL,
	"content" text NOT NULL,
	"mimeType" varchar(256),
	"size" integer,
	"checksum" varchar(64),
	"uploaderId" uuid,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_file" ADD CONSTRAINT "agent_file_fileId_file_asset_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."file_asset"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_uploaderId_User_id_fk" FOREIGN KEY ("uploaderId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
