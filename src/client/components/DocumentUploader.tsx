"use client";

import { useState, useRef, useCallback, ChangeEvent } from "react";
import { useFileUpload } from "../useFileUpload";
import { UploadProgress } from "./UploadProgress";
import { UploadConfirmResponse } from "../../config/types";
import { toast } from "sonner";

export interface DocumentItem {
  id: string;
  name: string;
  size: number;
  url: string;
  mimeType: string;
}

export interface DocumentUploaderProps {
  entityType?: string;
  documents?: DocumentItem[];
  onUploadSuccess?: (doc: DocumentItem) => void;
  onRemoveDocument?: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function DocumentUploader({
  entityType = "document",
  documents = [],
  onUploadSuccess,
  onRemoveDocument,
}: DocumentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docList, setDocList] = useState<DocumentItem[]>(documents);

  const { upload, status, currentStep, progress, error, isUploading } =
    useFileUpload({
      entityType,
      onSuccess: (result: UploadConfirmResponse) => {
        const newDoc: DocumentItem = {
          id: result.objectKey,
          name: result.originalFileName,
          size: result.fileSize,
          url: result.fileUrl,
          mimeType: result.mimeType,
        };
        setDocList((prev) => [...prev, newDoc]);
        toast.success(`Uploaded "${result.originalFileName}"`);
        onUploadSuccess?.(newDoc);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to upload document.");
      },
    });

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        upload(file);
      }
      e.target.value = "";
    },
    [upload]
  );

  const handleRemove = useCallback(
    (id: string) => {
      setDocList((prev) => prev.filter((d) => d.id !== id));
      onRemoveDocument?.(id);
      toast.info("Document removed");
    },
    [onRemoveDocument]
  );

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Upload trigger button / area */}
      <div className="flex items-center justify-between p-4 border border-gray-800 bg-gray-900/50 rounded-xl">
        <div>
          <h4 className="text-sm font-semibold text-gray-200">
            Documents & Attachments
          </h4>
          <p className="text-xs text-gray-400">
            PDFs, DOCX, XLSX, TXT up to 50MB
          </p>
        </div>
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-md"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {isUploading ? "Uploading..." : "Upload Document"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.txt,.csv,.zip"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
      </div>

      <UploadProgress
        status={status}
        currentStep={currentStep}
        progress={progress}
        errorMessage={error}
      />

      {/* Document items list */}
      {docList.length > 0 && (
        <div className="flex flex-col gap-2">
          {docList.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 bg-gray-900/80 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="overflow-hidden">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-gray-200 hover:text-blue-400 truncate block underline-offset-2 hover:underline"
                  >
                    {doc.name}
                  </a>
                  <span className="text-[10px] text-gray-400">
                    {formatBytes(doc.size)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-800 transition-colors"
                  title="View / Download"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(doc.id)}
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded-md hover:bg-gray-800 transition-colors"
                  title="Remove"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DocumentUploader;
