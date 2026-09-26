/**
 * Storage port.
 *
 * Two adapters: Supabase Storage (production) and in-memory (tests only —
 * refused by config when NODE_ENV=production). The port is small on purpose:
 * signed upload target, signed download URL, and a way to read the stored
 * object back so the API measures size and checksum from what was actually
 * stored rather than from what the client declared.
 */
export interface SignedUploadTarget {
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresInSeconds: number;
}

export interface StoredObjectInfo {
  readonly exists: boolean;
  readonly sizeBytes: number | null;
}

export interface StoragePort {
  readonly driver: 'supabase' | 'memory';
  ensureBucket(bucket: string): Promise<void>;
  createSignedUpload(bucket: string, path: string, contentType: string, ttlSeconds: number): Promise<SignedUploadTarget>;
  createSignedDownload(bucket: string, path: string, ttlSeconds: number): Promise<string>;
  stat(bucket: string, path: string): Promise<StoredObjectInfo>;
  /** Reads the object for measurement. Callers cap the size before calling. */
  read(bucket: string, path: string): Promise<Uint8Array>;
  remove(bucket: string, path: string): Promise<void>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
