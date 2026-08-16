# 🚀 Universal Secure File & Media Uploader (`@axosecurity/universal-uploader`)

[![npm version](https://img.shields.io/npm/v/@axosecurity/universal-uploader.svg)](https://www.npmjs.com/package/@axosecurity/universal-uploader)
[![Security Researcher: axosolaman](https://img.shields.io/badge/Author-axosolaman-blue.svg)](https://github.com/axosolaman)
[![Research: Axo Security](https://img.shields.io/badge/Research-Axo%20Security-purple.svg)](https://github.com/axosecurity)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Zero Server Bandwidth](https://img.shields.io/badge/Bandwidth-0%20Server%20Load-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)]()

> **The modern, zero-server-bandwidth file and media upload system for Next.js, React, and web apps.**  
> Upload directly to Cloudflare R2 / AWS S3 with Web Worker image compression, parallel multi-file concurrency, drop-in UI components, and built-in 5-layer security verification.

---

## ⚡ Highlights at a Glance

* **⚡ Zero Server Bandwidth**: Uploads stream directly from the browser to S3 / Cloudflare R2 via presigned PUT URLs. Your web server never touches or buffers the files in RAM.
* **🚀 3x–5x Faster Parallel Uploads**: Asynchronous concurrency worker pool (`concurrency: 3–5`) uploads multi-file batches simultaneously with per-file progress tracking and fault tolerance.
* **🎨 Client-Side Web Worker Optimization**: Automatically compresses large photos, resizes images, and strips sensitive EXIF GPS location data on a background browser thread before upload.
* **🛡️ Built-in 5-Layer Security**: Includes cryptographic presigned token locks, S3 `HeadObject` validation, and 16-byte binary magic byte inspection without complex configuration.
* **🧩 Ready-to-Use UI Components**: Ships with sleek, accessible React components (`FileDropzone`, `AvatarUploader`, `DocumentUploader`, `UploadProgress`) and a headless `useFileUpload` hook.
* **🗄️ Database Agnostic**: Production-ready schemas for both **Prisma** and **Drizzle ORM**.

---

## 📊 Comparison: Universal Uploader vs. Alternatives

| Feature | `@axosecurity/universal-uploader` | **Uploadthing** | **Multer / Server Uploads** | **Cloudinary** |
| :--- | :--- | :--- | :--- | :--- |
| **Server Bandwidth** | **Zero (Direct-to-S3/R2)** | Zero (Direct) | ❌ High (Full payload hits server) | Zero (Direct) |
| **Data Ownership** | ✅ **100% Self-Hosted (S3/R2/MinIO)** | ❌ Locked to their infra | ✅ Yes | ❌ Proprietary Cloud |
| **Parallel Concurrency Pool** | ✅ **Built-in (`concurrency: 3-5`)** | ⚠️ Basic | ❌ Sequential / Manual | ⚠️ Basic |
| **Client-Side Compression & EXIF Strip** | ✅ **Built-in Web Worker** | ❌ Manual | ❌ Server-Side Only | ⚠️ Cloud-side |
| **Binary Magic Byte Check** | ✅ **S3 Byte-Range (Zero Bandwidth)** | ⚠️ Basic | ⚠️ Requires full buffer | ⚠️ In-flight |
| **Cost** | 💸 **S3 Storage Only ($0 lock-in)** | 💳 Monthly SaaS Tier | 💸 High Server & Bandwidth Costs | 💳 High SaaS Pricing |

---

## 💡 Real-World Use Cases

1. **User Profile & Avatar Management**:
   * Circular avatar uploader with client-side cropping and automatic atomic deletion of old avatars from storage (`swapMode: "atomic_replace"`).
2. **E-Commerce & Photo Galleries**:
   * Drag-and-drop batch uploader that compresses 15MB mobile photos to ~800KB web-optimized images in Web Workers and uploads 10–20 files in parallel.
3. **Documents & Invoice Vaults**:
   * Strict PDF, DOCX, XLSX, and TXT upload verification with magic-byte checking and per-document download/removal actions.
4. **Chat & Ticket Attachments**:
   * Headless `useFileUpload` hook for seamless custom file inputs with individual and aggregate progress bars.

---

## 📦 Installation

```bash
# Using npm
npm install @axosecurity/universal-uploader @aws-sdk/client-s3 @aws-sdk/s3-request-presigner browser-image-compression zod sonner

# Using pnpm
pnpm add @axosecurity/universal-uploader @aws-sdk/client-s3 @aws-sdk/s3-request-presigner browser-image-compression zod sonner
```

---

## 🚀 3-Minute Quick Start

### 1. Configure Environment Variables (`.env.local`)

```env
# Cloudflare R2 / AWS S3 Credentials
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://pub-your-id.r2.dev

# Database Connection
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
```

---

### 2. Define Upload Rules (`src/config/uploader.ts`)

```typescript
import { defineUploadRegistry } from "@axosecurity/universal-uploader/config";

export const uploadRegistry = defineUploadRegistry({
  avatar: {
    folder: "avatars",
    allowedMimes: ["image/jpeg", "image/png", "image/webp"],
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    magicByteCheck: true,
    compressClientSide: true,
    compressionOptions: { maxSizeMB: 1.5, maxWidthOrHeight: 1024 },
    swapMode: "atomic_replace", // Deletes previous avatar automatically
    requiresAuth: true,
  },
  document: {
    folder: "documents",
    allowedMimes: ["application/pdf", "text/plain", "application/zip"],
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
    compressionOptions: { maxSizeMB: 4, maxWidthOrHeight: 2560 },
    swapMode: "append",
    requiresAuth: true,
  },
});
```

---

### 3. Create Next.js API Routes (App Router)

#### `src/app/api/upload/request/route.ts`
```typescript
import { createUploadRequestHandler } from "@axosecurity/universal-uploader/server";
import { uploadRegistry } from "@/config/uploader";
import { db } from "@/db";

export const POST = createUploadRequestHandler({
  registry: uploadRegistry,
  getAuthUser: async (req) => {
    // Return authenticated user or null
    return { id: "user_123", authId: "user_123" };
  },
  db: {
    getUser: async (authId) => ({ id: authId }),
    createIntent: async (data) => db.uploadIntent.create({ data }),
    getIntent: async (id, userId) => db.uploadIntent.findFirst({ where: { id } }),
    updateIntentStatus: async (id, status, completedAt) => {
      await db.uploadIntent.update({ where: { id }, data: { status, completedAt } });
    },
  },
});
```

#### `src/app/api/upload/confirm/route.ts`
```typescript
import { createUploadConfirmHandler } from "@axosecurity/universal-uploader/server";
import { uploadRegistry } from "@/config/uploader";
import { db } from "@/db";

export const POST = createUploadConfirmHandler({
  registry: uploadRegistry,
  db: {
    getUser: async (authId) => ({ id: authId }),
    createIntent: async (data) => db.uploadIntent.create({ data }),
    getIntent: async (id, userId) => db.uploadIntent.findFirst({ where: { id } }),
    updateIntentStatus: async (id, status, completedAt) => {
      await db.uploadIntent.update({ where: { id }, data: { status, completedAt } });
    },
  },
});
```

---

## 🎨 Frontend Usage & React Components

### 1. Headless Hook `useFileUpload` (Single & Parallel Uploads)

```tsx
"use client";

import { useFileUpload } from "@axosecurity/universal-uploader/client";

export function GalleryUpload() {
  const {
    uploadMultiple,
    isUploading,
    progress,
    status,
    fileItems,
    error,
  } = useFileUpload({
    entityType: "gallery",
    concurrency: 4, // Upload up to 4 files simultaneously
    onFileSuccess: (res, file) => console.log(`✓ Uploaded ${file.name}:`, res.fileUrl),
    onFileError: (err, file) => console.error(`✗ Failed ${file.name}:`, err.message),
  });

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={(e) => e.target.files && uploadMultiple(Array.from(e.target.files))}
      />

      {isUploading && (
        <div className="mt-4">
          <p>Overall Progress: {progress}% ({status})</p>
          {fileItems.map((item) => (
            <div key={item.id}>
              {item.file.name}: {item.status} ({item.progress}%)
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
```

---

### 2. Multi-File Cloud Dropzone

```tsx
import { FileDropzone } from "@axosecurity/universal-uploader/client";

export function GallerySection() {
  return (
    <FileDropzone
      entityType="gallery"
      multiple={true}
      maxFiles={10}
      label="Drop gallery photos here"
      sublabel="PNG, JPEG, WebP (Compressed in Web Worker)"
      onSuccess={(results) => console.log("Uploaded batch:", results)}
    />
  );
}
```

---

### 3. Circular Avatar Uploader

```tsx
import { AvatarUploader } from "@axosecurity/universal-uploader/client";

export function ProfileHeader({ user }) {
  return (
    <AvatarUploader
      entityType="avatar"
      currentAvatarUrl={user.avatarUrl}
      onAvatarUpdate={async (newUrl) => {
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

export function AttachmentsList() {
  return (
    <DocumentUploader
      entityType="document"
      onUploadSuccess={(doc) => console.log("Attached document:", doc)}
      onRemoveDocument={(id) => console.log("Removed document:", id)}
    />
  );
}
```

---

## 🗄️ Database Schemas

### Drizzle ORM (`schema.ts`)
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

### Prisma ORM (`schema.prisma`)
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

## 🌐 Storage Bucket CORS Configuration

Add this CORS configuration to your Cloudflare R2 or AWS S3 bucket:

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

## 🛡️ Security & Bug Bounty Research

> 📖 **Looking for the in-depth security analysis?**  
> Read our comprehensive **[`SECURITY.md`](./SECURITY.md)** for:
> * The **Master CWE Mitigation Matrix** (CWE-434, CWE-646, CWE-22, CWE-200, CWE-79).
> * Bug bounty platform statistics and payout mechanics ($3k–$30k+ RCEs).
> * Why **server-side EXIF stripping causes RCE/SSRF/DoS** (CVE-2021-22204, ImageTragick) vs. client-side Web Workers.
> * Detailed threat models and attacker exploit scenario breakdowns.

---

## 👨‍💻 Author & Security Researcher Profile

**Universal Secure File & Media Uploader** (`@axosecurity/universal-uploader`) is created, architected, and maintained by **[axosolaman](https://github.com/axosolaman)** ([Axo Security](https://github.com/axosecurity)).

* **Lead Security Researcher**: **[axosolaman](https://github.com/axosolaman)**
* **GitHub Profile**: [@axosolaman](https://github.com/axosolaman)
* **Organization**: [Axo Security (@axosecurity)](https://github.com/axosecurity)
* **Core Expertise**: Web Application Security, Bug Bounty Research, Threat Modeling, Zero-Trust Cloud Architectures, and Defensive AppSec Engineering.

> 💬 **Feedback & Security Audits**: If you are using `@axosecurity/universal-uploader` in your production stack, feel free to star the repo or connect directly on GitHub with **[axosolaman](https://github.com/axosolaman)**.

---

## 📄 License

MIT License © 2026 axosolaman (Axo Security). Open source for commercial and enterprise production use.
