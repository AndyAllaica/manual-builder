import { Module } from '@nestjs/common';
import { DataAccessModule } from '../data/data-access.module';
import { ManualsController } from './manuals.controller';
import { ManualsService } from './manuals.service';

@Module({
  imports: [DataAccessModule],
  controllers: [ManualsController],
  providers: [ManualsService],
})
export class ManualsModule {}
