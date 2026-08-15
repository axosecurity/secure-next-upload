import { deleteObject } from "./storage";

export interface CleanupStorageAdapter {
  findExpiredPendingIntents(maxAgeMinutes: number): Promise<Array<{ id: string; objectKey: string }>>;
  markIntentExpired(id: string): Promise<void>;
}

/**
 * Universal Garbage Collector for Abandoned Uploads
 * Sweeps pending intents older than maxAgeMinutes, deletes S3 object, and marks DB status 'expired'
 */
export async function cleanupOrphanedUploads(
  adapter: CleanupStorageAdapter,
  maxAgeMinutes: number = 5
): Promise<number> {
  const expiredIntents = await adapter.findExpiredPendingIntents(maxAgeMinutes);

  let cleaned = 0;
  for (const intent of expiredIntents) {
    try {
      await deleteObject(intent.objectKey);
    } catch {
      // Object may never have reached S3; ignore error
    }

    try {
      await adapter.markIntentExpired(intent.id);
      cleaned++;
    } catch (e) {
      console.error(`Failed to mark intent ${intent.id} expired:`, e);
    }
  }

  return cleaned;
}
