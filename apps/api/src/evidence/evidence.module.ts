import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UserProvisioningService } from '../auth/user-provisioning.service';
import { UploadService } from '../slice1/upload.service';
import { EvidenceLedgerService } from './evidence-ledger.service';
import { EvidenceService } from './evidence.service';
import { EvidenceController } from './evidence.controller';

/**
 * Evidence System (Phase 1). The ledger service is exported so the submission
 * and evaluation flows write ledger items inside their own transactions.
 */
@Module({
  imports: [StorageModule],
  controllers: [EvidenceController],
  providers: [UserProvisioningService, UploadService, EvidenceLedgerService, EvidenceService],
  exports: [EvidenceLedgerService],
})
export class EvidenceModule {}
