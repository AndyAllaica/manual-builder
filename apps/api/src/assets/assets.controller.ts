import { BadGatewayException, BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Response } from 'express';
import { OneDriveFileService } from '../storage/onedrive-file.service';

@Controller({ path: 'assets', version: '1' })
export class AssetsController {
  constructor(
    private readonly oneDriveFileService: OneDriveFileService,
    private readonly configService: ConfigService,
  ) {}

  @Get('storage/status')
  async getStorageStatus(@Query('checkToken') checkToken: string | undefined) {
    const provider = this.configService.get<string>('ASSET_STORAGE_PROVIDER', 'local').trim().toLowerCase();
    const shouldCheckToken = checkToken === 'true' || checkToken === '1';

    return {
      provider,
      oneDrive: {
        selected: provider === 'onedrive-business',
        rootPath: this.configService.get<string>('ONEDRIVE_ROOT_PATH', 'MANUAL_BUILDER'),
        tokenEndpointConfigured: hasConfig(this.configService, 'TOKEN_ACCESO_SERVICIOS')
          || hasConfig(this.configService, 'TOKEN_ONEDRIVE'),
        uploadEndpointConfigured: hasConfig(this.configService, 'SUBIR_ARCHIVO'),
        credentialsConfigured: hasConfig(this.configService, 'ID_APLICACION_ONEDRIVE')
          && hasConfig(this.configService, 'ID_CREDENCIAL_ONEDRIVE')
          && hasConfig(this.configService, 'JWT_SECRET_ONEDRIVE'),
        tokenCheck: shouldCheckToken && provider === 'onedrive-business'
          ? await this.oneDriveFileService.checkTokenConnection()
          : null,
      },
    };
  }

  @Get('onedrive/content')
  async redirectToOneDriveAsset(
    @Query('path') path: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const storagePath = sanitizeStoragePath(path);
    const metadata = await this.oneDriveFileService.resolveFileMetadata(storagePath);

    if (metadata.publicUrl === null) {
      throw new BadGatewayException('OneDrive no devolvio una URL de descarga para el archivo solicitado.');
    }

    response.redirect(metadata.publicUrl);
  }
}

function sanitizeStoragePath(path: string | undefined): string {
  if (path === undefined || path.trim().length === 0) {
    throw new BadRequestException('Debes indicar la ruta del asset.');
  }

  const normalizedPath = path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (
    normalizedPath.length === 0 ||
    normalizedPath.startsWith('../') ||
    normalizedPath.includes('/../') ||
    normalizedPath.endsWith('/..') ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new BadRequestException('La ruta del asset no es valida.');
  }

  return normalizedPath;
}

function hasConfig(configService: ConfigService, key: string): boolean {
  const value = configService.get<string>(key)?.trim();
  return value !== undefined && value.length > 0;
}
