import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageConfig {
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  region?: string;
  endpoint?: string;
}

export function createStorageClient(config?: Partial<StorageConfig>): S3Client {
  const accountId = config?.accountId || process.env.R2_ACCOUNT_ID;
  const accessKeyId = config?.accessKeyId || process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY!;
  const endpoint =
    config?.endpoint ||
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : undefined);

  const clientConfig: S3ClientConfig = {
    region: config?.region || "auto",
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  };

  if (endpoint) {
    clientConfig.endpoint = endpoint;
  }

  return new S3Client(clientConfig);
}

// Global default storage client singleton
export const defaultStorageClient = createStorageClient();

export async function generatePresignedUploadUrl(
  objectKey: string,
  mimeType: string,
  fileSize: number,
  expiresIn: number = 60,
  bucketName?: string,
  client: S3Client = defaultStorageClient
): Promise<string> {
  const bucket = bucketName || process.env.R2_BUCKET_NAME!;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimeType,
    ContentLength: fileSize,
  });

  return getSignedUrl(client, command, { expiresIn });
}

export async function headObject(
  objectKey: string,
  bucketName?: string,
  client: S3Client = defaultStorageClient
): Promise<{ contentLength: number; contentType: string } | null> {
  const bucket = bucketName || process.env.R2_BUCKET_NAME!;
  try {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: objectKey });
    const response = await client.send(command);
    return {
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType ?? "",
    };
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function readFirstBytes(
  objectKey: string,
  numBytes: number = 16,
  bucketName?: string,
  client: S3Client = defaultStorageClient
): Promise<Buffer> {
  const bucket = bucketName || process.env.R2_BUCKET_NAME!;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Range: `bytes=0-${numBytes - 1}`,
  });
  const response = await client.send(command);
  const arrayBuffer = await response.Body!.transformToByteArray();
  return Buffer.from(arrayBuffer);
}

export async function deleteObject(
  objectKey: string,
  bucketName?: string,
  client: S3Client = defaultStorageClient
): Promise<void> {
  const bucket = bucketName || process.env.R2_BUCKET_NAME!;
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: objectKey });
  await client.send(command);
}

export function buildPublicUrl(objectKey: string, customBaseUrl?: string): string {
  const baseUrl = (customBaseUrl || process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return `${baseUrl}/${objectKey}`;
}

export function extractKeyFromUrl(url: string, customBaseUrl?: string): string | null {
  const baseUrl = (customBaseUrl || process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!url || !url.startsWith(baseUrl)) return null;
  return url.substring(baseUrl.length).replace(/^\//, "");
}
