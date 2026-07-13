import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AuthModule } from '../auth/auth.module';
import { DataAccessModule } from '../data/data-access.module';

@Module({
  imports: [AuthModule, DataAccessModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
