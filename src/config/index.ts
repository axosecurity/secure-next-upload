import { EntityUploadConfig, UploadRegistry } from "./types";

export * from "./types";

export const MIME_EXTENSION_MAP: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/avif": [".avif"],
  "image/svg+xml": [".svg"],
  "application/pdf": [".pdf"],
  "application/zip": [".zip"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/plain": [".txt", ".csv", ".json"],
};

export const DEFAULT_UPLOAD_REGISTRY: UploadRegistry = {
  avatar: {
    folder: "avatars",
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    magicByteCheck: true,
    compressClientSide: true,
    compressionOptions: {
      maxSizeMB: 2,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    },
    swapMode: "atomic_replace",
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
    maxSizeBytes: 20 * 1024 * 1024, // 20MB
    magicByteCheck: true,
    compressClientSide: true,
    compressionOptions: {
      maxSizeMB: 5,
      maxWidthOrHeight: 2560,
      useWebWorker: true,
    },
    swapMode: "append",
    requiresAuth: true,
  },
  general: {
    folder: "uploads",
    allowedMimes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "text/plain",
    ],
    maxSizeBytes: 25 * 1024 * 1024,
    magicByteCheck: true,
    compressClientSide: false,
    swapMode: "append",
    requiresAuth: true,
  },
};

/** Helper to define custom upload registries with type checking */
export function defineUploadRegistry(registry: UploadRegistry): UploadRegistry {
  return registry;
}
