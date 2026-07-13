import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DataAccessModule } from '../data/data-access.module';
import { ManualsController } from './manuals.controller';
import { ManualsService } from './manuals.service';

@Module({
  imports: [AuthModule, DataAccessModule],
  controllers: [ManualsController],
  providers: [ManualsService],
})
export class ManualsModule {}
