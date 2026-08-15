"use client";

import { UploadStateStatus } from "../useFileUpload";
import { ProcessingStep } from "../image-processor";

interface UploadProgressProps {
  status: UploadStateStatus;
  currentStep?: ProcessingStep | null;
  progress?: number;
  errorMessage?: string | null;
}

const STEP_LABELS: Record<ProcessingStep, string> = {
  validating: "Validating file format...",
  reading_dimensions: "Analyzing image dimensions...",
  compressing: "Compressing & stripping metadata in Web Worker...",
  done: "Pre-processing complete",
};

const STATUS_LABELS: Record<UploadStateStatus, string> = {
  idle: "Ready",
  processing: "Optimizing file...",
  requesting_url: "Generating secure presigned token...",
  uploading: "Uploading directly to Cloud Storage...",
  confirming: "Performing 5-layer security & magic byte verification...",
  success: "Upload successful!",
  error: "Upload failed",
};

export function UploadProgress({
  status,
  currentStep,
  progress = 0,
  errorMessage,
}: UploadProgressProps) {
  if (status === "idle") return null;

  const isError = status === "error";
  const isSuccess = status === "success";

  return (
    <div className="w-full rounded-xl border border-gray-800 bg-gray-900/90 p-4 shadow-lg backdrop-blur-md transition-all">
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${
            isError
              ? "text-red-400"
              : isSuccess
              ? "text-emerald-400"
              : "text-blue-400"
          }`}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs font-mono text-gray-400">
          {status === "uploading" ? `${progress}%` : ""}
        </span>
      </div>

      {/* Progress Bar Track */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full transition-all duration-300 ease-out rounded-full ${
            isError
              ? "bg-red-500"
              : isSuccess
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
          } ${
            status === "processing" ||
            status === "requesting_url" ||
            status === "confirming"
              ? "animate-pulse w-full opacity-75"
              : ""
          }`}
          style={{
            width:
              status === "uploading"
                ? `${progress}%`
                : status === "success"
                ? "100%"
                : isError
                ? "100%"
                : "100%",
          }}
        />
      </div>

      {/* Secondary Step Subtitle */}
      {status === "processing" && currentStep && (
        <p className="mt-2 text-xs text-gray-400 animate-fade-in">
          {STEP_LABELS[currentStep]}
        </p>
      )}

      {/* Error Message */}
      {isError && errorMessage && (
        <p className="mt-2 text-xs font-medium text-red-400">
          ⚠️ {errorMessage}
        </p>
      )}
    </div>
  );
}

export default UploadProgress;
