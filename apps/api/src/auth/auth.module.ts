import { Module } from '@nestjs/common';
import { DataAccessModule } from '../data/data-access.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SimpleAuthGuard } from './simple-auth.guard';

@Module({
  imports: [DataAccessModule],
  controllers: [AuthController],
  providers: [AuthService, SimpleAuthGuard],
  exports: [AuthService, SimpleAuthGuard],
})
export class AuthModule {}
