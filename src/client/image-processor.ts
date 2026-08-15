import imageCompression from "browser-image-compression";
import { CompressionOptions } from "../config/types";

export interface ProcessedFile {
  blob: Blob;
  mimeType: string;
  fileName: string;
  originalSize: number;
  processedSize: number;
  width?: number;
  height?: number;
}

export type ProcessingStep =
  | "validating"
  | "reading_dimensions"
  | "compressing"
  | "done";

export async function processFile(
  file: File,
  options?: CompressionOptions,
  onProgress?: (step: ProcessingStep) => void
): Promise<ProcessedFile> {
  onProgress?.("validating");

  const isImage = file.type.startsWith("image/") && !file.type.includes("svg");

  if (!isImage || options?.maxSizeMB === undefined) {
    // Non-image or compression skipped: pass through as-is
    onProgress?.("done");
    return {
      blob: file,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      originalSize: file.size,
      processedSize: file.size,
    };
  }

  // Read dimensions if image
  onProgress?.("reading_dimensions");
  let width: number | undefined;
  let height: number | undefined;
  try {
    const dimensions = await getImageDimensions(file);
    width = dimensions.width;
    height = dimensions.height;
  } catch {
    // Non-fatal, continue compression
  }

  // Compress and strip EXIF
  onProgress?.("compressing");
  try {
    const compressionConfig = {
      maxSizeMB: options.maxSizeMB || 2,
      maxWidthOrHeight: options.maxWidthOrHeight || 1920,
      useWebWorker: options.useWebWorker ?? true,
      initialQuality: options.initialQuality || 0.85,
    };

    const compressedBlob = await imageCompression(file, compressionConfig);

    onProgress?.("done");
    return {
      blob: compressedBlob,
      mimeType: compressedBlob.type || file.type,
      fileName: file.name,
      originalSize: file.size,
      processedSize: compressedBlob.size,
      width,
      height,
    };
  } catch (error) {
    console.warn("Client compression failed, falling back to original file:", error);
    onProgress?.("done");
    return {
      blob: file,
      mimeType: file.type,
      fileName: file.name,
      originalSize: file.size,
      processedSize: file.size,
      width,
      height,
    };
  }
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}
