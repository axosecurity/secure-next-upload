"use client";

import { useState, useCallback, useRef } from "react";
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

export interface FileUploadItem {
  id: string;
  file: File;
  status: UploadStateStatus;
  step: ProcessingStep | null;
  progress: number;
  error: string | null;
  result: UploadConfirmResponse | null;
}

export interface UseFileUploadOptions {
  entityType?: string;
  requestEndpoint?: string;
  confirmEndpoint?: string;
  previousFileUrl?: string | null;
  compressionOptions?: CompressionOptions;
  concurrency?: number;
  onSuccess?: (result: UploadConfirmResponse) => void;
  onError?: (error: Error) => void;
  onFileSuccess?: (result: UploadConfirmResponse, file: File) => void;
  onFileError?: (error: Error, file: File) => void;
  onProgress?: (progress: number) => void;
}

export interface SingleUploadResult extends UploadConfirmResponse {
  file: File;
}

export interface MultipleUploadOptions extends Partial<UseFileUploadOptions> {
  metadata?: Record<string, unknown>;
  concurrency?: number;
  settled?: boolean; // If true, continues uploading remaining files on single error (default: true)
}

/**
 * Execute tasks with a maximum concurrency limit
 */
async function asyncPool<T, R>(
  poolLimit: number,
  array: T[],
  iteratorFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing = new Set<Promise<R>>();

  for (let i = 0; i < array.length; i++) {
    const item = array[i];
    const p = Promise.resolve().then(() => iteratorFn(item, i));
    ret.push(p);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean, clean);

    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(ret);
}

export function useFileUpload(defaultOptions?: UseFileUploadOptions) {
  const [status, setStatus] = useState<UploadStateStatus>("idle");
  const [currentStep, setCurrentStep] = useState<ProcessingStep | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadConfirmResponse | null>(null);
  const [results, setResults] = useState<SingleUploadResult[]>([]);
  const [fileItems, setFileItems] = useState<FileUploadItem[]>([]);

  const defaultConcurrency = defaultOptions?.concurrency ?? 3;
  const requestUrl = defaultOptions?.requestEndpoint || "/api/upload/request";
  const confirmUrl = defaultOptions?.confirmEndpoint || "/api/upload/confirm";

  const fileItemsRef = useRef<FileUploadItem[]>([]);

  const updateFileItem = useCallback(
    (id: string, patch: Partial<FileUploadItem>) => {
      setFileItems((prev) => {
        const next = prev.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        );
        fileItemsRef.current = next;
        return next;
      });
    },
    []
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setCurrentStep(null);
    setProgress(0);
    setError(null);
    setResult(null);
    setResults([]);
    setFileItems([]);
    fileItemsRef.current = [];
  }, []);

  /**
   * Internal single file upload pipeline
   */
  const executeSingleUpload = useCallback(
    async (
      file: File,
      itemId: string,
      options?: {
        entityType?: string;
        previousFileUrl?: string | null;
        compressionOptions?: CompressionOptions;
        metadata?: Record<string, unknown>;
        onProgressUpdate?: (itemProgress: number) => void;
      }
    ): Promise<UploadConfirmResponse> => {
      const entityType = options?.entityType || defaultOptions?.entityType || "general";
      const previousFileUrl =
        options?.previousFileUrl !== undefined
          ? options.previousFileUrl
          : defaultOptions?.previousFileUrl;
      const compression =
        options?.compressionOptions || defaultOptions?.compressionOptions;

      updateFileItem(itemId, { status: "processing", step: "validating", error: null });

      // Step 1: Pre-process file (compression & EXIF stripping for images)
      const processed = await processFile(file, compression, (step) => {
        updateFileItem(itemId, { step });
      });

      // Step 2: Request presigned upload URL
      updateFileItem(itemId, { status: "requesting_url", step: "done" });
      const reqRes = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          fileName: processed.fileName,
          mimeType: processed.mimeType,
          fileSize: processed.processedSize,
          metadata: options?.metadata,
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
      updateFileItem(itemId, { status: "uploading", progress: 0 });
      await uploadDirectToStorage(
        presignedUrl,
        processed.blob,
        processed.mimeType,
        (p) => {
          updateFileItem(itemId, { progress: p.percentage });
          options?.onProgressUpdate?.(p.percentage);
        }
      );

      // Step 4: Verification and confirmation
      updateFileItem(itemId, { status: "confirming", progress: 100 });
      const confRes = await fetch(confirmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadIntentId,
          previousFileUrl,
          customData: options?.metadata,
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
      updateFileItem(itemId, {
        status: "success",
        progress: 100,
        result: confirmData,
      });

      return confirmData;
    },
    [defaultOptions, requestUrl, confirmUrl, updateFileItem]
  );

  /**
   * Upload a single file
   */
  const upload = useCallback(
    async (
      file: File,
      overrideOptions?: Partial<UseFileUploadOptions> & {
        metadata?: Record<string, unknown>;
      }
    ): Promise<UploadConfirmResponse> => {
      reset();

      const itemId = `${file.name}-${Date.now()}`;
      const initialItem: FileUploadItem = {
        id: itemId,
        file,
        status: "processing",
        step: "validating",
        progress: 0,
        error: null,
        result: null,
      };

      setFileItems([initialItem]);
      fileItemsRef.current = [initialItem];
      setStatus("processing");
      setCurrentStep("validating");

      try {
        const confirmData = await executeSingleUpload(file, itemId, {
          entityType: overrideOptions?.entityType,
          previousFileUrl: overrideOptions?.previousFileUrl,
          compressionOptions: overrideOptions?.compressionOptions,
          metadata: overrideOptions?.metadata,
          onProgressUpdate: (p) => {
            setProgress(p);
            defaultOptions?.onProgress?.(p);
            overrideOptions?.onProgress?.(p);
          },
        });

        setStatus("success");
        setProgress(100);
        setResult(confirmData);
        setResults([{ ...confirmData, file }]);

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
        updateFileItem(itemId, { status: "error", error: errorObj.message });

        if (overrideOptions?.onError) {
          overrideOptions.onError(errorObj);
        } else if (defaultOptions?.onError) {
          defaultOptions.onError(errorObj);
        }

        throw errorObj;
      }
    },
    [reset, executeSingleUpload, defaultOptions, updateFileItem]
  );

  /**
   * Upload multiple files concurrently with pool concurrency management
   */
  const uploadMultiple = useCallback(
    async (
      files: File[],
      overrideOptions?: MultipleUploadOptions
    ): Promise<UploadConfirmResponse[]> => {
      if (files.length === 0) return [];

      reset();
      setStatus("uploading");
      setProgress(0);

      const concurrency =
        overrideOptions?.concurrency ?? defaultConcurrency;
      const settled = overrideOptions?.settled ?? true;

      // Initialize all items in the UI state
      const initialItems: FileUploadItem[] = files.map((file, idx) => ({
        id: `${file.name}-${idx}-${Date.now()}`,
        file,
        status: "idle",
        step: null,
        progress: 0,
        error: null,
        result: null,
      }));

      setFileItems(initialItems);
      fileItemsRef.current = initialItems;

      const progresses = new Array(files.length).fill(0);
      const successfulUploads: SingleUploadResult[] = [];
      const errors: Error[] = [];

      const calculateAggregateProgress = () => {
        const total = progresses.reduce((acc, curr) => acc + curr, 0);
        const agg = Math.round(total / files.length);
        setProgress(agg);
        defaultOptions?.onProgress?.(agg);
        overrideOptions?.onProgress?.(agg);
      };

      await asyncPool(concurrency, files, async (file, index) => {
        const item = initialItems[index];
        try {
          const res = await executeSingleUpload(file, item.id, {
            entityType: overrideOptions?.entityType,
            compressionOptions: overrideOptions?.compressionOptions,
            metadata: overrideOptions?.metadata,
            onProgressUpdate: (itemProgress) => {
              progresses[index] = itemProgress;
              calculateAggregateProgress();
            },
          });

          progresses[index] = 100;
          calculateAggregateProgress();

          const singleRes: SingleUploadResult = { ...res, file };
          successfulUploads.push(singleRes);
          setResults((prev) => [...prev, singleRes]);

          overrideOptions?.onFileSuccess?.(res, file);
          defaultOptions?.onFileSuccess?.(res, file);

          return res;
        } catch (err: unknown) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          errors.push(errorObj);
          updateFileItem(item.id, { status: "error", error: errorObj.message });

          overrideOptions?.onFileError?.(errorObj, file);
          defaultOptions?.onFileError?.(errorObj, file);

          if (!settled) {
            throw errorObj;
          }
          return null;
        }
      });

      if (successfulUploads.length === files.length) {
        setStatus("success");
        setProgress(100);
      } else if (successfulUploads.length > 0) {
        setStatus("success"); // Partial success
        setError(`${errors.length} of ${files.length} uploads failed.`);
      } else {
        setStatus("error");
        const mainError = errors[0] || new Error("All uploads failed.");
        setError(mainError.message);
        if (overrideOptions?.onError) {
          overrideOptions.onError(mainError);
        } else if (defaultOptions?.onError) {
          defaultOptions.onError(mainError);
        }
        throw mainError;
      }

      return successfulUploads;
    },
    [
      reset,
      defaultConcurrency,
      defaultOptions,
      executeSingleUpload,
      updateFileItem,
    ]
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
    fileItems,
    isUploading:
      status === "processing" ||
      status === "requesting_url" ||
      status === "uploading" ||
      status === "confirming",
    reset,
  };
}
