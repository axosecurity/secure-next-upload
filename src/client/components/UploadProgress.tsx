"use client";

import { UploadStateStatus, FileUploadItem } from "../useFileUpload";
import { ProcessingStep } from "../image-processor";

export interface UploadProgressProps {
  status: UploadStateStatus;
  currentStep?: ProcessingStep | null;
  progress?: number;
  errorMessage?: string | null;
  fileItems?: FileUploadItem[];
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
  success: "Upload complete!",
  error: "Upload failed",
};

export function UploadProgress({
  status,
  currentStep,
  progress = 0,
  errorMessage,
  fileItems = [],
}: UploadProgressProps) {
  if (status === "idle") return null;

  const isError = status === "error";
  const isSuccess = status === "success";
  const isMultiple = fileItems.length > 1;

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
          {isMultiple
            ? `Uploading ${fileItems.length} Files (${progress}%)`
            : STATUS_LABELS[status]}
        </span>
        <span className="text-xs font-mono text-gray-400">
          {status === "uploading" ? `${progress}%` : ""}
        </span>
      </div>

      {/* Aggregate Progress Bar Track */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full transition-all duration-300 ease-out rounded-full ${
            isError
              ? "bg-red-500"
              : isSuccess
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
          } ${
            !isMultiple &&
            (status === "processing" ||
              status === "requesting_url" ||
              status === "confirming")
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

      {/* Single file secondary step subtitle */}
      {!isMultiple && status === "processing" && currentStep && (
        <p className="mt-2 text-xs text-gray-400">
          {STEP_LABELS[currentStep]}
        </p>
      )}

      {/* Multi-file individual item progress list */}
      {isMultiple && (
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-800/80 pt-2">
          {fileItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between text-[11px] text-gray-300"
            >
              <span className="truncate max-w-[200px] sm:max-w-[280px]">
                {item.file.name}
              </span>
              <div className="flex items-center gap-2">
                {item.status === "error" ? (
                  <span className="text-red-400 font-medium">Failed</span>
                ) : item.status === "success" ? (
                  <span className="text-emerald-400 font-medium">✓ Done</span>
                ) : (
                  <span className="font-mono text-gray-400">
                    {item.progress}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
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
