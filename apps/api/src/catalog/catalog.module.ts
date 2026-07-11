import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { DataAccessModule } from '../data/data-access.module';

@Module({
  imports: [DataAccessModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
