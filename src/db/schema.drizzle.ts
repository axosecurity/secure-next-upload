import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const uploadIntents = pgTable(
  "upload_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id"),
    entityType: varchar("entity_type", { length: 50 }).default("general").notNull(),
    objectKey: varchar("object_key", { length: 512 }).notNull().unique(),
    originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | completed | failed | expired
    metadata: jsonb("metadata"),
    presignedUrlExpiresAt: timestamp("presigned_url_expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    userStatusIdx: index("upload_intents_user_status_idx").on(
      table.userId,
      table.status
    ),
    entityStatusIdx: index("upload_intents_entity_status_idx").on(
      table.entityType,
      table.status
    ),
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id"),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("audit_logs_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);
