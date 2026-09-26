import { Global, Module } from '@nestjs/common';
import { STORAGE_PORT } from './storage.port';
import { SupabaseStorageAdapter } from './supabase-storage.adapter';
import { MemoryStorageAdapter } from './memory-storage.adapter';

@Global()
@Module({
  providers: [{
    provide: STORAGE_PORT,
    useFactory: () => {
      const driver = process.env['STORAGE_DRIVER'] ?? 'supabase';
      if (driver === 'memory') {
        if (process.env['NODE_ENV'] === 'production') {
          throw new Error('STORAGE_DRIVER=memory is refused in production');
        }
        return new MemoryStorageAdapter();
      }
      const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
      const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
      if (!url || !key) throw new Error('Supabase storage needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      return new SupabaseStorageAdapter(url, key);
    },
  }],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
