export interface DirectUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export function uploadDirectToStorage(
  presignedUrl: string,
  data: Blob | File,
  mimeType: string,
  onProgress?: (progress: DirectUploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        onProgress?.({
          loaded: event.loaded,
          total: event.total,
          percentage,
        });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `Storage upload failed with HTTP status ${xhr.status}: ${xhr.statusText}`
          )
        );
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during direct storage upload. Check CORS settings."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted by user."));
    });

    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.send(data);
  });
}
