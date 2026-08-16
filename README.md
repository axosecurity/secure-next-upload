# 🛡️ Universal Secure File & Media Uploader (`@axosecurity/universal-uploader`)

[![npm version](https://img.shields.io/npm/v/@axosecurity/universal-uploader.svg)](https://www.npmjs.com/package/@axosecurity/universal-uploader)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Zero Server Bandwidth](https://img.shields.io/badge/Bandwidth-0%20Server%20Load-brightgreen.svg)]()
[![Security](https://img.shields.io/badge/Security-5--Layer%20Inspection-blueviolet.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)]()

> **Production-grade, zero-server-bandwidth, universal multi-entity file and media upload system for Next.js, React, and modern web applications.**  
> Powered by Cloudflare R2 / AWS S3 presigned PUT URLs, browser Web Worker image compression with EXIF stripping, parallel concurrent uploads, and 5-layer binary magic byte security verification.

---

## 📑 Table of Contents
- [Why Universal Uploader?](#-why-universal-uploader)
- [Architecture & Sequence Diagram](#-architecture--sequence-diagram)
- [Key Features](#-key-features)
- [Installation & Setup](#-installation--setup)
- [Environment Variables](#-environment-variables)
- [Database Schema Setup](#-database-schema-setup)
- [Server Integration (Next.js App Router)](#-server-integration-nextjs-app-router)
- [Upload Registry Configuration](#-upload-registry-configuration)
- [Client Usage & Headless Hook](#-client-usage--headless-hook)
  - [1. Headless Hook `useFileUpload` (Single & Parallel Uploads)](#1-headless-hook-usefileupload)
  - [2. Multi-File Cloud Dropzone](#2-multi-file-cloud-dropzone)
  - [3. Circular Avatar Uploader with Atomic Swap](#3-circular-avatar-uploader-with-atomic-swap)
  - [4. Document & Attachment Vault](#4-document--attachment-vault)
- [Storage Bucket CORS Configuration](#-storage-bucket-cors-configuration)
- [Orphan Intent Garbage Collection](#-orphan-intent-garbage-collection)
- [License](#-license)

---

## 🌟 Why Universal Uploader?

Traditional file upload architectures stream megabytes or gigabytes of binary file data directly through your backend API servers. This drains server memory, saturates bandwidth, hits serverless execution limits (e.g. Vercel 4.5MB payload limits), and leaves applications vulnerable to file extension spoofing and malicious binary injection.

**Universal Uploader** solves this with an impenetrable zero-server-bandwidth architecture:

1. **⚡ Zero Server Bandwidth**: Binary payloads stream directly from client browsers to Object Storage (Cloudflare R2, AWS S3, MinIO, GCS) via cryptographic Presigned PUT URLs. Your web server never touches or buffers the file binaries.
2. **🚀 Parallel Concurrent Uploads**: Upload batches of files with configurable concurrency worker pools (e.g. 3–5 parallel streams), per-file progress tracking, and fault-tolerant settled execution (3x–5x faster than sequential uploading).
3. **🛡️ 5-Layer Defense-in-Depth Security**:
   - **Layer 1 (Pre-flight client validation)**: MIME whitelist, size boundaries, and Web Worker compression.
   - **Layer 2 (Cryptographic token issuance)**: Presigned PUT URL locked to strict `Content-Type` and `Content-Length` at the cloud edge.
   - **Layer 3 (Storage metadata verification)**: Post-upload `HeadObject` byte validation against intent records.
   - **Layer 4 (16-byte magic byte binary inspection)**: Server inspects raw file binary signatures (`0x89PNG`, `%PDF`, `FF D8 FF`, `RIFF...WEBP`, etc.) using S3 byte-range requests without downloading full files.
   - **Layer 5 (Atomic commit & lifecycle management)**: Single-use intent tokens, atomic file replacement (`atomic_replace`), and instant purge of failed uploads.
4. **🎨 Client-Side Web Worker Optimization**: Automatically resizes images, strips sensitive EXIF geolocation metadata (GPS), and compresses images on a background thread *before* requesting an upload token.
5. **🗄️ Database Agnostic**: Out-of-the-box support and production schemas for both **Prisma** and **Drizzle ORM**.

---

## 🔄 Architecture & Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (React / Browser)
    participant A as API Server (/api/upload/*)
    participant D as Database (PostgreSQL)
    participant S as Cloud Storage (R2 / S3)
    participant R as Rate Limiter (Redis / In-Memory)

    Note over C: 1. User selects file(s)
    opt Image Entity (compressClientSide: true)
        C->>C: Compress image & Strip EXIF metadata (Web Worker)
    end
    
    Note over C, A: Phase 1: Upload Intent Request
    C->>A: POST /api/upload/request { entityType, fileName, fileSize, mimeType }
    A->>R: Execute Token Bucket Rate Limit
    R-->>A: Rate limit OK
    A->>A: Lookup entity in UploadRegistry & Validate Constraints
    A->>D: Insert upload_intents (status: 'pending')
    A->>A: Generate 7-char random objectKey (folder/aB3_x9Z.ext)
    A->>S: Generate Presigned PUT URL (Strict Content-Type & Content-Length)
    A-->>C: Return presignedUrl, uploadIntentId, objectKey
    
    Note over C, S: Phase 2: Direct Upload (0 Server Bandwidth)
    C->>S: PUT request directly to S3 URL with file binary
    S-->>C: 200 OK (Validated at cloud edge)
    
    Note over C, D: Phase 3: Verification & Atomic Action
    C->>A: POST /api/upload/confirm { uploadIntentId, previousFileUrl }
    A->>D: Query upload_intent by ID (verify status == 'pending')
    A->>S: HeadObject(objectKey)
    A->>A: Verify size & mime match intent within tolerance
    opt If magicByteCheck enabled
        A->>S: GetObject(objectKey, Range: bytes=0-15)
        A->>A: Inspect raw Magic Bytes against MIME signature
    end
    alt Validation Failed (Mismatch / Spoofed Payload)
        A->>S: DeleteObject(objectKey)
        A->>D: Update intent (status: 'failed')
        A-->>C: 422 Unprocessable Entity
    else Verification Successful
        opt If swapMode == 'atomic_replace' & previousFileUrl provided
            A->>S: DeleteObject(extractKey(previousFileUrl))
        end
        A->>D: Update upload_intents.status = 'completed'
        A->>D: Insert audit_logs
        A-->>C: 200 OK { fileUrl, objectKey, metadata }
    end
```

---

## 📦 Installation & Setup

```bash
# Using npm
npm install @axosecurity/universal-uploader @aws-sdk/client-s3 @aws-sdk/s3-request-presigner browser-image-compression zod sonner

# Using pnpm
pnpm add @axosecurity/universal-uploader @aws-sdk/client-s3 @aws-sdk/s3-request-presigner browser-image-compression zod sonner

# Using yarn
yarn add @axosecurity/universal-uploader @aws-sdk/client-s3 @aws-sdk/s3-request-presigner browser-image-compression zod sonner
```

---

## 🔑 Environment Variables

Add your S3 / Cloudflare R2 bucket credentials to your `.env` or `.env.local`:

```env
# Cloudflare R2 / AWS S3 Storage Credentials
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://pub-your-id.r2.dev

# Or AWS S3 Standard
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_BUCKET_NAME=your_bucket_name
AWS_PUBLIC_URL=https://your-bucket.s3.amazonaws.com

# Database URL
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
```

---

## 🗄️ Database Schema Setup

The uploader tracks each presigned URL with an intent record to guarantee single-use confirmation and audit trails.

### Option A: Drizzle ORM (`schema.ts`)
```typescript
import { pgTable, uuid, varchar, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const uploadIntents = pgTable("upload_intents", {
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
}, (table) => ({
  userStatusIdx: index("upload_intents_user_status_idx").on(table.userId, table.status),
  entityStatusIdx: index("upload_intents_entity_status_idx").on(table.entityType, table.status),
}));
```

### Option B: Prisma ORM (`schema.prisma`)
```prisma
model UploadIntent {
  id                    String    @id @default(uuid())
  userId                String?   @map("user_id")
  entityType            String    @default("general") @map("entity_type")
  objectKey             String    @unique @map("object_key")
  originalFileName      String    @map("original_file_name")
  mimeType              String    @map("mime_type")
  fileSize              Int       @map("file_size")
  status                String    @default("pending")
  metadata              Json?
  presignedUrlExpiresAt DateTime  @map("presigned_url_expires_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  completedAt           DateTime? @map("completed_at")

  @@index([userId, status])
  @@index([entityType, status])
  @@map("upload_intents")
}
```

---

## ⚙️ Upload Registry Configuration

Define allowed entity types and security policies declaratively in a shared config file:

```typescript
// src/config/uploader.ts
import { defineUploadRegistry } from "@axosecurity/universal-uploader/config";

export const uploadRegistry = defineUploadRegistry({
  avatar: {
    folder: "avatars",
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    magicByteCheck: true,
    compressClientSide: true,
    compressionOptions: {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    },
    swapMode: "atomic_replace", // Automatically deletes old avatar from S3 upon success
    requiresAuth: true,
  },
  document: {
    folder: "documents",
    allowedMimes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "application/zip",
    ],
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    magicByteCheck: true,
    compressClientSide: false,
    swapMode: "append",
    requiresAuth: true,
  },
  gallery: {
    folder: "gallery",
    allowedMimes: ["image/jpeg", "image/png", "image/webp"],
    maxSizeBytes: 20 * 1024 * 1024,
    magicByteCheck: true,
    compressClientSide: true,
    compressionOptions: {
      maxSizeMB: 4,
      maxWidthOrHeight: 2560,
      useWebWorker: true,
    },
    swapMode: "append",
    requiresAuth: true,
  },
});
```

---

## 🚀 Server Integration (Next.js App Router)

Create the two unified API endpoints with minimal boilerplate.

### 1. `src/app/api/upload/request/route.ts`
```typescript
import { createUploadRequestHandler } from "@axosecurity/universal-uploader/server";
import { uploadRegistry } from "@/config/uploader";
import { db } from "@/db"; // Your Prisma or Drizzle client

export const POST = createUploadRequestHandler({
  registry: uploadRegistry,
  getAuthUser: async (req) => {
    // Return authenticated user or null
    // e.g. const session = await auth(); return session?.user ? { id: session.user.id, authId: session.user.id } : null;
    return { id: "user_123", authId: "user_123" };
  },
  db: {
    getUser: async (authId) => {
      const user = await db.user.findUnique({ where: { id: authId } });
      return user ? { id: user.id } : null;
    },
    createIntent: async (data) => {
      return await db.uploadIntent.create({ data });
    },
    getIntent: async (intentId, userId) => {
      return await db.uploadIntent.findFirst({
        where: { id: intentId, ...(userId ? { userId } : {}) },
      });
    },
    updateIntentStatus: async (intentId, status, completedAt) => {
      await db.uploadIntent.update({
        where: { id: intentId },
        data: { status, completedAt },
      });
    },
  },
});
```

### 2. `src/app/api/upload/confirm/route.ts`
```typescript
import { createUploadConfirmHandler } from "@axosecurity/universal-uploader/server";
import { uploadRegistry } from "@/config/uploader";
import { db } from "@/db";

export const POST = createUploadConfirmHandler({
  registry: uploadRegistry,
  fileSizeTolerance: 0.10, // Allows 10% delta between client compression and S3 HeadObject
  db: {
    getUser: async (authId) => ({ id: authId }),
    createIntent: async (data) => db.uploadIntent.create({ data }),
    getIntent: async (intentId, userId) => {
      return await db.uploadIntent.findFirst({
        where: { id: intentId, ...(userId ? { userId } : {}) },
      });
    },
    updateIntentStatus: async (intentId, status, completedAt) => {
      await db.uploadIntent.update({
        where: { id: intentId },
        data: { status, completedAt },
      });
    },
  },
});
```

---

## 🎨 Client Usage & Headless Hook

Import frontend modules from `@axosecurity/universal-uploader/client`.

### 1. Headless Hook `useFileUpload`

The `useFileUpload` hook supports single uploads, **parallel multi-file uploads with concurrency worker pooling**, per-file state tracking, and aggregate progress reporting.

```tsx
"use client";

import { useFileUpload } from "@axosecurity/universal-uploader/client";

export function FileUploaderExample() {
  const {
    upload,
    uploadMultiple,
    isUploading,
    progress,
    status,
    fileItems,
    error,
  } = useFileUpload({
    entityType: "gallery",
    concurrency: 4, // Upload up to 4 files in parallel
    onSuccess: (result) => {
      console.log("Upload finished:", result.fileUrl);
    },
    onFileSuccess: (result, file) => {
      console.log(`✓ ${file.name} uploaded to:`, result.fileUrl);
    },
    onFileError: (err, file) => {
      console.error(`✗ ${file.name} failed:`, err.message);
    },
  });

  const handleMultipleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      uploadMultiple(Array.from(e.target.files), {
        concurrency: 4, // Override concurrency per batch
      });
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto bg-gray-900 text-white rounded-xl">
      <input type="file" multiple onChange={handleMultipleFiles} />

      {isUploading && (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            Overall Progress: {progress}% ({status})
          </p>
          
          {/* Multi-item individual progress tracking */}
          <div className="mt-2 space-y-1">
            {fileItems.map((item) => (
              <div key={item.id} className="text-xs flex justify-between text-gray-300">
                <span className="truncate">{item.file.name}</span>
                <span>{item.status} ({item.progress}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
```

---

### 2. Multi-File Cloud Dropzone

A ready-to-use drag-and-drop component with built-in parallel upload feedback:

```tsx
import { FileDropzone } from "@axosecurity/universal-uploader/client";

export function ProductGallerySection() {
  return (
    <FileDropzone
      entityType="gallery"
      multiple={true}
      maxFiles={15}
      label="Drag & drop product images here"
      sublabel="PNG, JPEG, WebP up to 20MB (Compressed in Web Worker)"
      onSuccess={(results) => {
        console.log("Successfully uploaded batch:", results);
      }}
      onError={(err) => {
        alert(err.message);
      }}
    />
  );
}
```

---

### 3. Circular Avatar Uploader with Atomic Swap

Includes client-side cropping, Web Worker compression, and automatic deletion of previous avatar images from S3 storage:

```tsx
import { AvatarUploader } from "@axosecurity/universal-uploader/client";

export function UserProfileHeader({ user }) {
  return (
    <AvatarUploader
      entityType="avatar"
      currentAvatarUrl={user.avatarUrl}
      onAvatarUpdate={async (newUrl) => {
        // Save new avatar URL to user record in DB
        await updateUserAvatar(user.id, newUrl);
      }}
    />
  );
}
```

---

### 4. Document & Attachment Vault

```tsx
import { DocumentUploader } from "@axosecurity/universal-uploader/client";

export function ContractAttachments() {
  return (
    <DocumentUploader
      entityType="document"
      onUploadSuccess={(doc) => {
        console.log("Attached document:", doc.name, doc.url);
      }}
      onRemoveDocument={(id) => {
        console.log("Removed document:", id);
      }}
    />
  );
}
```

---

## 🌐 Storage Bucket CORS Configuration

Set this CORS policy on your Cloudflare R2 or AWS S3 bucket to allow browser direct PUT uploads:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://yourdomain.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 🧹 Orphan Intent Garbage Collection

To clean up abandoned presigned URL intents and unverified files in storage, run the cleanup cron utility:

```typescript
// scripts/cleanup-cron.ts or Next.js Cron Route
import { runUploadCleanupCron } from "@axosecurity/universal-uploader/server";
import { db } from "@/db";

export async function runCron() {
  const result = await runUploadCleanupCron({
    db: {
      getExpiredPendingIntents: async (cutoff) => {
        return await db.uploadIntent.findMany({
          where: {
            status: "pending",
            createdAt: { lt: cutoff },
          },
        });
      },
      markIntentsExpired: async (ids) => {
        await db.uploadIntent.updateMany({
          where: { id: { in: ids } },
          data: { status: "expired" },
        });
      },
    },
    maxAgeMinutes: 60, // Mark pending intents older than 1 hour as expired
  });

  console.log(`Cleaned up ${result.cleaned} abandoned intents.`);
}
```

---

## 🛡️ License

MIT License © 2026 Axo Security. Open source for commercial and private use.
