import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'node:path';
import { AppController } from './app.controller';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CaptureSessionsModule } from './capture-sessions/capture-sessions.module';
import { ManualsModule } from './manuals/manuals.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { createTypeOrmOptions } from './database/typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(__dirname, '..', '.env'),
        resolve(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => createTypeOrmOptions(configService),
    }),
    AuthModule,
    WorkspacesModule,
    AssetsModule,
    CatalogModule,
    ManualsModule,
    CaptureSessionsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
