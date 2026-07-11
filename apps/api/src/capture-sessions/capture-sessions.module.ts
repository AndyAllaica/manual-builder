import { Module } from '@nestjs/common';
import { DataAccessModule } from '../data/data-access.module';
import { CaptureSessionsController } from './capture-sessions.controller';
import { CaptureSessionsService } from './capture-sessions.service';

@Module({
  imports: [DataAccessModule],
  controllers: [CaptureSessionsController],
  providers: [CaptureSessionsService],
})
export class CaptureSessionsModule {}
