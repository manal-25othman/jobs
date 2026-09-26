import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SignedUploadTarget, StoragePort, StoredObjectInfo } from './storage.port';

/**
 * Supabase Storage through the service role.
 *
 * The service role bypasses storage RLS, so every method here is called only
 * after the API has checked ownership on the `upload` row. Buckets are private
 * and no raw object URL is ever returned — only signed, short-lived ones.
 */
export class SupabaseStorageAdapter implements StoragePort {
  readonly driver = 'supabase' as const;
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async ensureBucket(bucket: string): Promise<void> {
    const { data } = await this.client.storage.getBucket(bucket);
    if (data) return;
    const { error } = await this.client.storage.createBucket(bucket, { public: false });
    if (error && !/already exists/i.test(error.message)) throw new Error(`createBucket: ${error.message}`);
  }

  async createSignedUpload(bucket: string, path: string, contentType: string, ttlSeconds: number): Promise<SignedUploadTarget> {
    // Supabase signed upload URLs are valid for a fixed window (2h upstream);
    // the API's own `upload.created_at` + ttl decides whether a confirm is
    // still accepted, so the product's shorter window still holds.
    const { data, error } = await this.client.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`createSignedUploadUrl: ${error?.message ?? 'no data'}`);
    return {
      url: data.signedUrl,
      method: 'PUT',
      headers: { 'content-type': contentType, 'x-upsert': 'false' },
      expiresInSeconds: ttlSeconds,
    };
  }

  async createSignedDownload(bucket: string, path: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, ttlSeconds);
    if (error || !data) throw new Error(`createSignedUrl: ${error?.message ?? 'no data'}`);
    return data.signedUrl;
  }

  async stat(bucket: string, path: string): Promise<StoredObjectInfo> {
    const dir = path.split('/').slice(0, -1).join('/');
    const name = path.split('/').pop()!;
    const { data, error } = await this.client.storage.from(bucket).list(dir, { search: name, limit: 100 });
    if (error) throw new Error(`list: ${error.message}`);
    const found = (data ?? []).find((o) => o.name === name);
    const size = (found?.metadata as { size?: number } | undefined)?.size ?? null;
    return { exists: !!found, sizeBytes: size };
  }

  async read(bucket: string, path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(bucket).download(path);
    if (error || !data) throw new Error(`download: ${error?.message ?? 'no data'}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(bucket: string, path: string): Promise<void> {
    await this.client.storage.from(bucket).remove([path]);
  }
}
