"use client";

import { useState, useCallback } from "react";
import { processFile, ProcessingStep } from "./image-processor";
import { uploadDirectToStorage } from "./direct-upload";
import {
  UploadRequestResponse,
  UploadConfirmResponse,
  CompressionOptions,
} from "../config/types";

export type UploadStateStatus =
  | "idle"
  | "processing"
  | "requesting_url"
  | "uploading"
  | "confirming"
  | "success"
  | "error";

export interface UseFileUploadOptions {
  entityType?: string;
  requestEndpoint?: string;
  confirmEndpoint?: string;
  previousFileUrl?: string | null;
  compressionOptions?: CompressionOptions;
  onSuccess?: (result: UploadConfirmResponse) => void;
  onError?: (error: Error) => void;
}

export interface SingleUploadResult extends UploadConfirmResponse {
  file: File;
}

export function useFileUpload(defaultOptions?: UseFileUploadOptions) {
  const [status, setStatus] = useState<UploadStateStatus>("idle");
  const [currentStep, setCurrentStep] = useState<ProcessingStep | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadConfirmResponse | null>(null);
  const [results, setResults] = useState<SingleUploadResult[]>([]);

  const requestUrl = defaultOptions?.requestEndpoint || "/api/upload/request";
  const confirmUrl = defaultOptions?.confirmEndpoint || "/api/upload/confirm";

  const reset = useCallback(() => {
    setStatus("idle");
    setCurrentStep(null);
    setProgress(0);
    setError(null);
    setResult(null);
  }, []);

  const upload = useCallback(
    async (
      file: File,
      overrideOptions?: Partial<UseFileUploadOptions> & {
        metadata?: Record<string, unknown>;
      }
    ): Promise<UploadConfirmResponse> => {
      const entityType =
        overrideOptions?.entityType || defaultOptions?.entityType || "general";
      const previousFileUrl =
        overrideOptions?.previousFileUrl !== undefined
          ? overrideOptions.previousFileUrl
          : defaultOptions?.previousFileUrl;
      const compression =
        overrideOptions?.compressionOptions || defaultOptions?.compressionOptions;

      reset();

      try {
        // Step 1: Pre-process file (compression & EXIF stripping for images)
        setStatus("processing");
        const processed = await processFile(file, compression, (step) =>
          setCurrentStep(step)
        );

        // Step 2: Request presigned upload URL
        setStatus("requesting_url");
        const reqRes = await fetch(requestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType,
            fileName: processed.fileName,
            mimeType: processed.mimeType,
            fileSize: processed.processedSize,
            metadata: overrideOptions?.metadata,
          }),
        });

        if (!reqRes.ok) {
          const errData = await reqRes.json().catch(() => ({}));
          throw new Error(
            errData.error?.message ||
              `Upload request failed with status ${reqRes.status}`
          );
        }

        const { uploadIntentId, presignedUrl }: UploadRequestResponse =
          await reqRes.json();

        // Step 3: Direct-to-storage PUT
        setStatus("uploading");
        setProgress(0);
        await uploadDirectToStorage(
          presignedUrl,
          processed.blob,
          processed.mimeType,
          (p) => setProgress(p.percentage)
        );

        // Step 4: Verification and confirmation
        setStatus("confirming");
        const confRes = await fetch(confirmUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadIntentId,
            previousFileUrl,
            customData: overrideOptions?.metadata,
          }),
        });

        if (!confRes.ok) {
          const errData = await confRes.json().catch(() => ({}));
          throw new Error(
            errData.error?.message ||
              `Verification failed with status ${confRes.status}`
          );
        }

        const confirmData: UploadConfirmResponse = await confRes.json();

        setStatus("success");
        setResult(confirmData);
        setResults((prev) => [...prev, { ...confirmData, file }]);

        if (overrideOptions?.onSuccess) {
          overrideOptions.onSuccess(confirmData);
        } else if (defaultOptions?.onSuccess) {
          defaultOptions.onSuccess(confirmData);
        }

        return confirmData;
      } catch (err: unknown) {
        setStatus("error");
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj.message);

        if (overrideOptions?.onError) {
          overrideOptions.onError(errorObj);
        } else if (defaultOptions?.onError) {
          defaultOptions.onError(errorObj);
        }

        throw errorObj;
      }
    },
    [defaultOptions, requestUrl, confirmUrl, reset]
  );

  const uploadMultiple = useCallback(
    async (
      files: File[],
      overrideOptions?: Partial<UseFileUploadOptions>
    ): Promise<UploadConfirmResponse[]> => {
      const uploaded: UploadConfirmResponse[] = [];
      for (const file of files) {
        const res = await upload(file, overrideOptions);
        uploaded.push(res);
      }
      return uploaded;
    },
    [upload]
  );

  return {
    upload,
    uploadMultiple,
    status,
    currentStep,
    progress,
    error,
    result,
    results,
    isUploading:
      status === "processing" ||
      status === "requesting_url" ||
      status === "uploading" ||
      status === "confirming",
    reset,
  };
}
