import { Module } from '@nestjs/common';
import { DataAccessModule } from '../data/data-access.module';
import { AssetsController } from './assets.controller';

@Module({
  imports: [DataAccessModule],
  controllers: [AssetsController],
})
export class AssetsModule {}
