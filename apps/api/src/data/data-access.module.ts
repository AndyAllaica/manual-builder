import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseBootstrapService } from '../database/database-bootstrap.service';
import { MANUAL_BUILDER_ENTITIES } from '../database/entities';
import { ManualBuilderRepository } from './manual-builder.repository';
import { ASSET_STORAGE_SERVICE, type AssetStorageService } from '../storage/asset-storage.types';
import { LocalAssetStorageService } from '../storage/local-asset-storage.service';
import { OneDriveAssetStorageService } from '../storage/onedrive-asset-storage.service';
import { OneDriveFileService } from '../storage/onedrive-file.service';

@Module({
  imports: [TypeOrmModule.forFeature([...MANUAL_BUILDER_ENTITIES])],
  providers: [
    ManualBuilderRepository,
    DatabaseBootstrapService,
    LocalAssetStorageService,
    OneDriveFileService,
    OneDriveAssetStorageService,
    {
      provide: ASSET_STORAGE_SERVICE,
      inject: [ConfigService, LocalAssetStorageService, OneDriveAssetStorageService],
      useFactory: (
        configService: ConfigService,
        localAssetStorageService: LocalAssetStorageService,
        oneDriveAssetStorageService: OneDriveAssetStorageService,
      ): AssetStorageService => {
        const provider = configService.get<string>('ASSET_STORAGE_PROVIDER', 'local').trim().toLowerCase();
        const logger = new Logger('AssetStorageProvider');

        switch (provider) {
          case 'local':
            logger.warn('Proveedor de assets activo: local. Las capturas se guardaran en disco.');
            return localAssetStorageService;
          case 'onedrive-business':
            validateOneDriveStorageConfiguration(configService);
            logger.log('Proveedor de assets activo: onedrive-business. Las capturas se subiran a OneDrive.');
            return oneDriveAssetStorageService;
          default:
            throw new Error(`ASSET_STORAGE_PROVIDER no soportado: ${provider}. Usa "local" u "onedrive-business".`);
        }
      },
    },
  ],
  exports: [
    ManualBuilderRepository,
    LocalAssetStorageService,
    OneDriveFileService,
    ASSET_STORAGE_SERVICE,
  ],
})
export class DataAccessModule {}

function validateOneDriveStorageConfiguration(configService: ConfigService): void {
  const tokenEndpoint = getOptionalConfig(configService, 'TOKEN_ACCESO_SERVICIOS')
    ?? getOptionalConfig(configService, 'TOKEN_ONEDRIVE');

  if (tokenEndpoint === null) {
    throw new Error('Para ASSET_STORAGE_PROVIDER=onedrive-business debes configurar TOKEN_ACCESO_SERVICIOS o TOKEN_ONEDRIVE.');
  }

  for (const key of [
    'SUBIR_ARCHIVO',
    'ID_APLICACION_ONEDRIVE',
    'ID_CREDENCIAL_ONEDRIVE',
    'JWT_SECRET_ONEDRIVE',
  ]) {
    getRequiredConfig(configService, key);
  }
}

function getOptionalConfig(configService: ConfigService, key: string): string | null {
  const value = configService.get<string>(key)?.trim();
  return value !== undefined && value.length > 0 ? value : null;
}

function getRequiredConfig(configService: ConfigService, key: string): string {
  const value = getOptionalConfig(configService, key);
  if (value === null) {
    throw new Error(`Falta configurar ${key} para usar OneDrive.`);
  }

  return value;
}
