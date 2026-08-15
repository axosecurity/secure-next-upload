import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import {
  UploadRegistry,
  DEFAULT_UPLOAD_REGISTRY,
  MIME_EXTENSION_MAP,
} from "../config";
import {
  generatePresignedUploadUrl,
  headObject,
  readFirstBytes,
  deleteObject,
  buildPublicUrl,
  extractKeyFromUrl,
} from "./storage";
import { verifyMagicBytes } from "./magic-bytes";
import { checkRateLimit, RedisClientLike } from "./rate-limiter";

export interface DatabaseAdapter {
  getUser(authId: string): Promise<{ id: string } | null>;
  createIntent(data: {
    userId?: string | null;
    entityType: string;
    objectKey: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    metadata?: Record<string, unknown>;
    presignedUrlExpiresAt: Date;
  }): Promise<{ id: string }>;
  getIntent(
    intentId: string,
    userId?: string | null
  ): Promise<{
    id: string;
    userId?: string | null;
    entityType: string;
    objectKey: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    status: string;
    metadata?: unknown;
  } | null>;
  updateIntentStatus(
    intentId: string,
    status: "completed" | "failed" | "expired",
    completedAt?: Date
  ): Promise<void>;
  logAudit?(data: {
    userId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void>;
}

export interface UploadHandlerOptions {
  registry?: UploadRegistry;
  db: DatabaseAdapter;
  getAuthUser?: (req: Request) => Promise<{ id: string; authId: string } | null>;
  redis?: RedisClientLike;
  presignedUrlExpiry?: number;
  fileSizeTolerance?: number; // default 0.10 (10%)
}

const requestSchema = z.object({
  entityType: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});

const confirmSchema = z.object({
  uploadIntentId: z.string().uuid(),
  previousFileUrl: z.string().url().nullable().optional(),
  customData: z.record(z.unknown()).optional(),
});

export function createUploadRequestHandler(options: UploadHandlerOptions) {
  const registry = options.registry || DEFAULT_UPLOAD_REGISTRY;
  const expiry = options.presignedUrlExpiry || 60;

  return async function POST(req: Request) {
    try {
      const user = options.getAuthUser ? await options.getAuthUser(req) : null;
      const ip =
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "anonymous";

      // Parse payload
      const body = await req.json().catch(() => null);
      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request payload.",
              details: parsed.error.flatten().fieldErrors,
            },
          },
          { status: 422 }
        );
      }

      const { entityType, fileName, mimeType, fileSize, metadata } = parsed.data;

      // Check Entity Registry
      const config = registry[entityType];
      if (!config) {
        return NextResponse.json(
          {
            error: {
              code: "UNKNOWN_ENTITY",
              message: `Unknown entity type "${entityType}". Valid entities: ${Object.keys(registry).join(", ")}`,
            },
          },
          { status: 400 }
        );
      }

      // Check Auth if required
      if (config.requiresAuth && !user) {
        return NextResponse.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Authentication required for this upload type.",
            },
          },
          { status: 401 }
        );
      }

      // Rate limit check
      const rateLimitId = user?.id || ip;
      const rateCheck = await checkRateLimit(rateLimitId, 30, 30, options.redis);
      if (!rateCheck.success) {
        return NextResponse.json(
          {
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Too many upload requests. Please wait a moment.",
            },
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(rateCheck.limit),
              "X-RateLimit-Remaining": String(rateCheck.remaining),
            },
          }
        );
      }

      // Validate MIME against entity whitelist
      if (!config.allowedMimes.includes(mimeType)) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_MIME_TYPE",
              message: `MIME type "${mimeType}" is not allowed for ${entityType}. Allowed: ${config.allowedMimes.join(", ")}`,
            },
          },
          { status: 422 }
        );
      }

      // Validate File Extension against MIME
      const fileExt = "." + fileName.split(".").pop()?.toLowerCase();
      const validExts = MIME_EXTENSION_MAP[mimeType];
      if (validExts && !validExts.includes(fileExt)) {
        return NextResponse.json(
          {
            error: {
              code: "EXTENSION_MISMATCH",
              message: `File extension "${fileExt}" does not match declared MIME "${mimeType}".`,
            },
          },
          { status: 422 }
        );
      }

      // Validate File Size
      if (fileSize > config.maxSizeBytes) {
        const maxMb = Math.round(config.maxSizeBytes / 1024 / 1024);
        return NextResponse.json(
          {
            error: {
              code: "FILE_TOO_LARGE",
              message: `File size exceeds the ${maxMb}MB limit for ${entityType}.`,
            },
          },
          { status: 422 }
        );
      }

      // Generate 7-char random key (cache-busting)
      const randomKey = crypto.randomBytes(6).toString("base64url").slice(0, 7);
      const ext = validExts ? validExts[0] : fileExt;
      const objectKey = `${config.folder}/${randomKey}${ext}`;

      const expiresAt = new Date(Date.now() + expiry * 1000);

      // Record Intent
      const intent = await options.db.createIntent({
        userId: user?.id || null,
        entityType,
        objectKey,
        originalFileName: fileName,
        mimeType,
        fileSize,
        metadata: metadata || {},
        presignedUrlExpiresAt: expiresAt,
      });

      // Generate Presigned PUT URL
      const presignedUrl = await generatePresignedUploadUrl(
        objectKey,
        mimeType,
        fileSize,
        expiry
      );

      // Audit Log
      if (options.db.logAudit) {
        await options.db.logAudit({
          userId: user?.id || null,
          action: `${entityType}.upload.requested`,
          resourceType: "upload_intent",
          resourceId: intent.id,
          metadata: { fileName, mimeType, fileSize, objectKey },
          ipAddress: ip,
        });
      }

      return NextResponse.json({
        uploadIntentId: intent.id,
        objectKey,
        presignedUrl,
        expiresIn: expiry,
        entityType,
      });
    } catch (error) {
      console.error("Universal Upload Request Error:", error);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred while requesting upload.",
          },
        },
        { status: 500 }
      );
    }
  };
}

export function createUploadConfirmHandler(options: UploadHandlerOptions) {
  const registry = options.registry || DEFAULT_UPLOAD_REGISTRY;
  const tolerance = options.fileSizeTolerance ?? 0.10;

  return async function POST(req: Request) {
    try {
      const user = options.getAuthUser ? await options.getAuthUser(req) : null;
      const ip =
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "anonymous";

      const body = await req.json().catch(() => null);
      const parsed = confirmSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid confirmation payload.",
              details: parsed.error.flatten().fieldErrors,
            },
          },
          { status: 422 }
        );
      }

      const { uploadIntentId, previousFileUrl } = parsed.data;

      // Fetch intent from DB
      const intent = await options.db.getIntent(uploadIntentId, user?.id);
      if (!intent) {
        return NextResponse.json(
          {
            error: {
              code: "INTENT_NOT_FOUND",
              message: "Upload intent not found or unauthorized.",
            },
          },
          { status: 404 }
        );
      }

      if (intent.status === "completed") {
        return NextResponse.json(
          {
            error: {
              code: "ALREADY_COMPLETED",
              message: "This upload has already been verified and completed.",
            },
          },
          { status: 409 }
        );
      }

      if (intent.status !== "pending") {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: `Upload intent has status "${intent.status}" and cannot be confirmed.`,
            },
          },
          { status: 400 }
        );
      }

      const config = registry[intent.entityType];

      // Layer 3: HeadObject verification
      const head = await headObject(intent.objectKey);
      if (!head) {
        return NextResponse.json(
          {
            error: {
              code: "OBJECT_NOT_FOUND",
              message: "Object not found in storage. Upload may have failed or expired.",
            },
          },
          { status: 404 }
        );
      }

      // Verify file size within tolerance
      const sizeDiff = Math.abs(head.contentLength - intent.fileSize) / intent.fileSize;
      if (sizeDiff > tolerance) {
        await deleteObject(intent.objectKey);
        await options.db.updateIntentStatus(intent.id, "failed");
        return NextResponse.json(
          {
            error: {
              code: "SIZE_MISMATCH",
              message: `File size mismatch. Declared ${intent.fileSize} bytes, got ${head.contentLength} bytes.`,
            },
          },
          { status: 422 }
        );
      }

      // Verify Content-Type
      if (head.contentType && head.contentType !== intent.mimeType) {
        await deleteObject(intent.objectKey);
        await options.db.updateIntentStatus(intent.id, "failed");
        return NextResponse.json(
          {
            error: {
              code: "MIME_MISMATCH",
              message: `MIME type mismatch. Declared "${intent.mimeType}", got "${head.contentType}".`,
            },
          },
          { status: 422 }
        );
      }

      // Layer 4: Magic byte verification
      if (config?.magicByteCheck) {
        const headerBytes = await readFirstBytes(intent.objectKey, 16);
        const isValidMagic = verifyMagicBytes(headerBytes, intent.mimeType);

        if (!isValidMagic) {
          await deleteObject(intent.objectKey);
          await options.db.updateIntentStatus(intent.id, "failed");

          if (options.db.logAudit) {
            await options.db.logAudit({
              userId: user?.id || null,
              action: `${intent.entityType}.upload.rejected.magic_mismatch`,
              resourceType: "upload_intent",
              resourceId: intent.id,
              metadata: {
                declaredMime: intent.mimeType,
                headerBytesHex: headerBytes.toString("hex"),
              },
              ipAddress: ip,
            });
          }

          return NextResponse.json(
            {
              error: {
                code: "MALICIOUS_PAYLOAD",
                message: "File binary header signature does not match declared type.",
              },
            },
            { status: 422 }
          );
        }
      }

      // Atomic replace: Delete previous file from storage if specified
      if (config?.swapMode === "atomic_replace" && previousFileUrl) {
        const oldKey = extractKeyFromUrl(previousFileUrl);
        if (oldKey) {
          try {
            await deleteObject(oldKey);
          } catch (e) {
            console.warn(`Failed to delete previous object ${oldKey}:`, e);
          }
        }
      }

      // Mark intent completed
      await options.db.updateIntentStatus(intent.id, "completed", new Date());

      const publicUrl = buildPublicUrl(intent.objectKey);

      if (options.db.logAudit) {
        await options.db.logAudit({
          userId: user?.id || null,
          action: `${intent.entityType}.upload.confirmed`,
          resourceType: intent.entityType,
          resourceId: intent.id,
          metadata: {
            objectKey: intent.objectKey,
            fileSize: head.contentLength,
            mimeType: intent.mimeType,
            publicUrl,
          },
          ipAddress: ip,
        });
      }

      return NextResponse.json({
        fileUrl: publicUrl,
        objectKey: intent.objectKey,
        entityType: intent.entityType,
        originalFileName: intent.originalFileName,
        fileSize: head.contentLength,
        mimeType: intent.mimeType,
        metadata: intent.metadata,
      });
    } catch (error) {
      console.error("Universal Upload Confirm Error:", error);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred during upload confirmation.",
          },
        },
        { status: 500 }
      );
    }
  };
}
