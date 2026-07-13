import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DataAccessModule } from '../data/data-access.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [AuthModule, DataAccessModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
