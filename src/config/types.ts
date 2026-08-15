import { z } from "zod";

export type SwapMode = "atomic_replace" | "append";

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  fileType?: string;
  initialQuality?: number;
}

export interface EntityUploadConfig {
  /** Target folder path inside storage bucket (e.g. 'avatars', 'documents', 'products') */
  folder: string;
  /** Allowed MIME types for this entity (e.g. ['image/jpeg', 'image/png', 'application/pdf']) */
  allowedMimes: string[];
  /** Maximum file size in bytes */
  maxSizeBytes: number;
  /** Whether to perform magic byte binary signature verification */
  magicByteCheck: boolean;
  /** Whether to compress and strip EXIF metadata on the client (images only) */
  compressClientSide?: boolean;
  /** Client-side image compression configuration */
  compressionOptions?: CompressionOptions;
  /** 'atomic_replace' will delete previousFileUrl upon confirmation; 'append' leaves existing assets intact */
  swapMode: SwapMode;
  /** Whether this upload requires authentication */
  requiresAuth: boolean;
  /** Optional custom metadata validation schema */
  metadataSchema?: z.ZodTypeAny;
}

export type UploadRegistry = Record<string, EntityUploadConfig>;

export interface UploadRequestPayload {
  entityType: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  metadata?: Record<string, unknown>;
}

export interface UploadRequestResponse {
  uploadIntentId: string;
  objectKey: string;
  presignedUrl: string;
  expiresIn: number;
  entityType: string;
}

export interface UploadConfirmPayload {
  uploadIntentId: string;
  previousFileUrl?: string | null;
  customData?: Record<string, unknown>;
}

export interface UploadConfirmResponse {
  fileUrl: string;
  objectKey: string;
  entityType: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  metadata?: Record<string, unknown> | null;
}
