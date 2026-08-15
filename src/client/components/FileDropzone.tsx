"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import { useFileUpload, UseFileUploadOptions } from "../useFileUpload";
import { UploadProgress } from "./UploadProgress";
import { UploadConfirmResponse } from "../../config/types";

export interface FileDropzoneProps {
  entityType?: string;
  multiple?: boolean;
  accept?: string;
  maxFiles?: number;
  label?: string;
  sublabel?: string;
  onSuccess?: (results: UploadConfirmResponse[]) => void;
  onError?: (error: Error) => void;
  uploadOptions?: UseFileUploadOptions;
}

export function FileDropzone({
  entityType = "general",
  multiple = false,
  accept,
  maxFiles = 10,
  label = "Drop files here or click to browse",
  sublabel = "Direct zero-bandwidth upload to cloud storage",
  onSuccess,
  onError,
  uploadOptions,
}: FileDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    upload,
    uploadMultiple,
    status,
    currentStep,
    progress,
    error,
    isUploading,
  } = useFileUpload({
    ...uploadOptions,
    entityType,
    onError,
  });

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).slice(0, multiple ? maxFiles : 1);
      if (files.length === 0) return;

      try {
        if (multiple) {
          const results = await uploadMultiple(files, { entityType });
          onSuccess?.(results);
        } else {
          const result = await upload(files[0], { entityType });
          onSuccess?.([result]);
        }
      } catch {
        // Error already handled in hook & callback
      }
    },
    [multiple, maxFiles, upload, uploadMultiple, entityType, onSuccess]
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
      if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
      e.target.value = "";
    },
    [handleFiles]
  );

  return (
    <div className="w-full flex flex-col gap-4">
      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
          isDragOver
            ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
            : "border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-900/60"
        } ${isUploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          disabled={isUploading}
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800/80 mb-4 text-blue-400 group-hover:scale-110 transition-transform">
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <p className="text-sm font-semibold text-gray-200 text-center">{label}</p>
        <p className="text-xs text-gray-400 text-center mt-1">{sublabel}</p>
      </div>

      <UploadProgress
        status={status}
        currentStep={currentStep}
        progress={progress}
        errorMessage={error}
      />
    </div>
  );
}

export default FileDropzone;
