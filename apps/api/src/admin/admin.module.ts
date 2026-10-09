import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';

@Module({ controllers: [AdminController], providers: [SupabaseAuthGuard, AdminService, AdminGuard] })
export class AdminModule {}
