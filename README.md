# 🛡️ Universal Secure File & Media Uploader (`@axosecurity/universal-uploader`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Zero Server Bandwidth](https://img.shields.io/badge/Bandwidth-0%20Server%20Load-brightgreen.svg)]()
[![Security](https://img.shields.io/badge/Security-5--Layer%20Inspection-blueviolet.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)]()

> A production-grade, zero-server-bandwidth, universal multi-entity file and media upload system for Next.js and modern web applications. Powered by Cloudflare R2 / AWS S3, Web Worker compression, and 5-layer binary security inspection.

---

## 🌟 Why Universal Uploader?

Traditional file uploading architectures stream gigabytes of user files directly through your backend API servers, draining server memory, congesting network bandwidth, and exposing your infrastructure to payload spoofing and malware attacks.

**Universal Uploader** solves this by establishing an impenetrable, zero-server-bandwidth architecture:

1. **⚡ Zero Server Bandwidth**: Binary payloads stream directly from client browsers to Object Storage (Cloudflare R2, AWS S3, MinIO, GCS) via cryptographic Presigned PUT URLs. Your web server never touches the file blobs.
2. **🌐 Unified Single-Endpoint Pair**: A single endpoint route (`/api/upload/request` and `/api/upload/confirm`) dynamically handles **any upload entity** (`avatar`, `document`, `product_gallery`, `resume_pdf`, `receipt`, etc.) via a type-safe `UploadRegistry`.
3. **🛡️ 5-Layer Defense-in-Depth Security**:
   - **Layer 1**: Strict Zod schema constraints on file size, extension, and MIME whitelist.
   - **Layer 2**: Cryptographic presigned URL signature locks `Content-Type` and `Content-Length` at the cloud edge.
   - **Layer 3**: Post-upload `HeadObject` metadata verification.
   - **Layer 4**: Deep 16-byte magic byte binary inspection across Images, PDFs, and Office/Zip documents.
   - **Layer 5**: State machine tracking (`pending` -> `completed`/`failed`/`expired`) with automated orphan cleanup.
4. **🎨 Client-Side Web Worker Optimization**: Automatically resizes images, strips sensitive EXIF geolocation metadata, and compresses images on a background Web Worker *before* requesting an upload token.
5. **🔄 Configurable Asset Lifecycles**:
   - `swapMode: "atomic_replace"`: Safely replaces previous asset and deletes old storage objects only after new upload verification succeeds.
   - `swapMode: "append"`: Appends new assets to collections without affecting existing records.
6. **⚡ Race-Condition-Free Rate Limiting**: Distributed Token Bucket backed by atomic Redis Lua scripts with fail-open safety.

---

## 🔄 End-to-End Sequence Architecture

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (React / Browser)
    participant A as API Server (/api/upload/*)
    participant D as Database (PostgreSQL)
    participant S as Cloud Storage (R2 / S3)
    participant R as Rate Limiter (Redis)

    Note over C: 1. User selects file(s)
    opt Image Entity (compressClientSide: true)
        C->>C: Compress image & Strip EXIF metadata (Web Worker)
    end
    
    Note over C, A: Phase 1: Upload Intent Request
    C->>A: POST /api/upload/request { entityType, fileName, fileSize, mimeType }
    A->>R: Execute Token Bucket Lua Script
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

### 1. Install Dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner browser-image-compression zod sonner
# or
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner browser-image-compression zod sonner
```

### 2. Copy the Package Folder
Copy the `src/` directory into your project under `src/lib/uploader/` or import from package.

### 3. Environment Variables
Add your cloud storage keys to your `.env.local`:

```env
# Cloudflare R2 / AWS S3
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://pub-xxxxxx.r2.dev

# Database
DATABASE_URL=postgres://user:pass@host:5432/db
```

---

## 🗄️ Database Schema Setup

Choose your ORM schema:

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

### Prisma Schema (`schema.prisma`)
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

## ⚙️ Configuring Upload Entities (`config/index.ts`)

Define custom channels and rules declaratively:

```typescript
export const UPLOAD_REGISTRY = {
  avatar: {
    folder: "avatars",
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    magicByteCheck: true,
    compressClientSide: true,
    compressionOptions: { maxSizeMB: 2, maxWidthOrHeight: 1024 },
    swapMode: "atomic_replace",
    requiresAuth: true,
  },
  document: {
    folder: "documents",
    allowedMimes: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
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
    compressionOptions: { maxSizeMB: 5, maxWidthOrHeight: 2560 },
    swapMode: "append",
    requiresAuth: true,
  },
};
```

---

## 🚀 Server Route Handler Integration

Create unified API route handlers with 1 line of code:

### `src/app/api/upload/request/route.ts`
```typescript
import { createUploadRequestHandler } from "@/lib/uploader/server";
import { DEFAULT_UPLOAD_REGISTRY } from "@/lib/uploader/config";

export const POST = createUploadRequestHandler({
  registry: DEFAULT_UPLOAD_REGISTRY,
  getAuthUser: async (req) => {
    // Return authenticated user or null
    return { id: "user_uuid", authId: "auth_id" };
  },
  db: {
    getUser: async (authId) => ({ id: "user_uuid" }),
    createIntent: async (data) => {
      // Insert into upload_intents
      return { id: "intent_uuid" };
    },
    getIntent: async (id) => null,
    updateIntentStatus: async (id, status) => {},
  },
});
```

### `src/app/api/upload/confirm/route.ts`
```typescript
import { createUploadConfirmHandler } from "@/lib/uploader/server";
import { DEFAULT_UPLOAD_REGISTRY } from "@/lib/uploader/config";

export const POST = createUploadConfirmHandler({
  registry: DEFAULT_UPLOAD_REGISTRY,
  db: { /* your DB adapter */ },
});
```

---

## 🎨 UI Components & Frontend Usage

### 1. Circular Avatar Uploader
```tsx
import { UniversalAvatarUploader } from "@/lib/uploader";

export function ProfileAvatar({ user }) {
  return (
    <UniversalAvatarUploader
      currentAvatarUrl={user.avatarUrl}
      onAvatarUpdate={(newUrl) => console.log("Updated avatar:", newUrl)}
    />
  );
}
```

### 2. Document & Attachment Vault
```tsx
import { DocumentUploader } from "@/lib/uploader";

export function DocumentSection() {
  return (
    <DocumentUploader
      entityType="document"
      onUploadSuccess={(doc) => console.log("Uploaded document:", doc)}
      onRemoveDocument={(id) => console.log("Removed:", id)}
    />
  );
}
```

### 3. Multi-File Cloud Dropzone
```tsx
import { FileDropzone } from "@/lib/uploader";

export function ProductGallery() {
  return (
    <FileDropzone
      entityType="gallery"
      multiple={true}
      maxFiles={10}
      label="Drop product images here"
      onSuccess={(results) => console.log("Uploaded batch:", results)}
    />
  );
}
```

### 4. Custom Headless Hook (`useFileUpload`)
```tsx
import { useFileUpload } from "@/lib/uploader";

export function CustomButton() {
  const { upload, isUploading, progress, status, error } = useFileUpload({
    entityType: "document",
    onSuccess: (res) => alert(`File uploaded: ${res.fileUrl}`),
  });

  return (
    <div>
      <input type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {isUploading && <p>Progress: {progress}% ({status})</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
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
      "https://your-production-domain.com"
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

## 🛡️ License

MIT License © 2026 Axo Security. Open source for commercial and private use.
