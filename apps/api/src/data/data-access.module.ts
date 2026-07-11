import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseBootstrapService } from '../database/database-bootstrap.service';
import { MANUAL_BUILDER_ENTITIES } from '../database/entities';
import { ManualBuilderRepository } from './manual-builder.repository';
import { LocalAssetStorageService } from '../storage/local-asset-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([...MANUAL_BUILDER_ENTITIES])],
  providers: [
    ManualBuilderRepository,
    DatabaseBootstrapService,
    LocalAssetStorageService,
  ],
  exports: [
    ManualBuilderRepository,
    LocalAssetStorageService,
  ],
})
export class DataAccessModule {}
