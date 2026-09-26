import { randomBytes } from 'node:crypto';
import type { SignedUploadTarget, StoragePort, StoredObjectInfo } from './storage.port';

/**
 * TEST DOUBLE. In-memory storage with the same contract as Supabase Storage,
 * including signed-URL semantics: a PUT to a signed target stores the bytes,
 * and a download URL is valid only until its expiry. Refused in production by
 * @naqla/config. It exists so ownership, provenance, measurement and the
 * report boundary can be proven without a live Supabase project; it proves
 * nothing about Supabase itself.
 */
export class MemoryStorageAdapter implements StoragePort {
  readonly driver = 'memory' as const;
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  private readonly uploadTokens = new Map<string, { key: string; expiresAt: number; contentType: string }>();
  private readonly downloadTokens = new Map<string, { key: string; expiresAt: number }>();

  private key(bucket: string, path: string): string { return `${bucket}:${path}`; }

  async ensureBucket(): Promise<void> { /* buckets are implicit */ }

  async createSignedUpload(bucket: string, path: string, contentType: string, ttlSeconds: number): Promise<SignedUploadTarget> {
    const token = randomBytes(16).toString('hex');
    this.uploadTokens.set(token, { key: this.key(bucket, path), expiresAt: Date.now() + ttlSeconds * 1000, contentType });
    return { url: `memory://upload/${token}`, method: 'PUT', headers: { 'content-type': contentType }, expiresInSeconds: ttlSeconds };
  }

  /** What a client's PUT to the signed URL does. */
  put(url: string, bytes: Uint8Array): void {
    const token = url.replace('memory://upload/', '');
    const t = this.uploadTokens.get(token);
    if (!t || t.expiresAt < Date.now()) throw new Error('signed upload URL is invalid or expired');
    this.objects.set(t.key, { bytes, contentType: t.contentType });
    this.uploadTokens.delete(token);
  }

  async createSignedDownload(bucket: string, path: string, ttlSeconds: number): Promise<string> {
    const token = randomBytes(16).toString('hex');
    this.downloadTokens.set(token, { key: this.key(bucket, path), expiresAt: Date.now() + ttlSeconds * 1000 });
    return `memory://download/${token}`;
  }

  /** What a client's GET of a signed download URL returns. */
  get(url: string): Uint8Array {
    const token = url.replace('memory://download/', '');
    const t = this.downloadTokens.get(token);
    if (!t || t.expiresAt < Date.now()) throw new Error('signed download URL is invalid or expired');
    const o = this.objects.get(t.key);
    if (!o) throw new Error('object not found');
    return o.bytes;
  }

  async stat(bucket: string, path: string): Promise<StoredObjectInfo> {
    const o = this.objects.get(this.key(bucket, path));
    return { exists: !!o, sizeBytes: o ? o.bytes.byteLength : null };
  }

  async read(bucket: string, path: string): Promise<Uint8Array> {
    const o = this.objects.get(this.key(bucket, path));
    if (!o) throw new Error('object not found');
    return o.bytes;
  }

  async remove(bucket: string, path: string): Promise<void> { this.objects.delete(this.key(bucket, path)); }

  /** Direct access is what a raw bucket URL would be. It must never be needed. */
  hasObject(bucket: string, path: string): boolean { return this.objects.has(this.key(bucket, path)); }
}
