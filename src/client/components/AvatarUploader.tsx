"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent, useEffect } from "react";
import { useFileUpload } from "../useFileUpload";
import { UploadProgress } from "./UploadProgress";
import { toast } from "sonner";

export interface UniversalAvatarUploaderProps {
  currentAvatarUrl?: string | null;
  onAvatarUpdate?: (newUrl: string) => void;
  entityType?: string;
  maxSizeBytes?: number;
}

export function UniversalAvatarUploader({
  currentAvatarUrl,
  onAvatarUpdate,
  entityType = "avatar",
}: UniversalAvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    upload,
    status,
    currentStep,
    progress,
    error,
    isUploading,
  } = useFileUpload({
    entityType,
    previousFileUrl: currentAvatarUrl,
    onSuccess: (result) => {
      setPreviewUrl(result.fileUrl);
      toast.success("Profile picture updated successfully!");
      onAvatarUpdate?.(result.fileUrl);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update avatar.");
    },
  });

  useEffect(() => {
    if (currentAvatarUrl && status === "idle") {
      setPreviewUrl(currentAvatarUrl);
    }
  }, [currentAvatarUrl, status]);

  const handleFile = useCallback(
    async (file: File) => {
      // Create local preview immediately
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);

      try {
        await upload(file);
      } catch {
        // Rollback preview on error
        setPreviewUrl(currentAvatarUrl || null);
      } finally {
        URL.revokeObjectURL(localPreview);
      }
    },
    [upload, currentAvatarUrl]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className={`relative w-44 h-44 rounded-full border-4 border-dashed transition-all duration-200 cursor-pointer overflow-hidden group ${
          isDragOver
            ? "border-blue-500 scale-105 shadow-xl shadow-blue-500/20"
            : "border-gray-700 bg-gray-900"
        } ${isUploading ? "opacity-60 pointer-events-none" : "hover:border-blue-400"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          onChange={handleInputChange}
          className="hidden"
          disabled={isUploading}
        />

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Avatar Preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-400">
            <svg
              className="w-14 h-14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        )}

        {!isUploading && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <svg
              className="w-7 h-7 text-white mb-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-xs font-semibold text-white">Change Avatar</span>
          </div>
        )}
      </div>

      <div className="w-full max-w-xs">
        <UploadProgress
          status={status}
          currentStep={currentStep}
          progress={progress}
          errorMessage={error}
        />
      </div>

      <p className="text-xs text-gray-400 text-center max-w-xs">
        Zero-server-bandwidth • Auto Web Worker compression • EXIF stripped
      </p>
    </div>
  );
}

export default UniversalAvatarUploader;
