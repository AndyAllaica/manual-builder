import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getApiRoot() {
    return {
      name: 'manual-builder-api',
      status: 'ok',
      version: '0.1.0',
      purpose: 'Backend base para catalogo de sistemas, sesiones de captura y manuales de usuario.',
      storageProviders: ['local', 'onedrive-business'],
      routes: [
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/me',
        '/api/v1/workspaces',
        '/api/v1/workspaces/:workspaceId/members',
        '/api/v1/assets/storage/status',
        '/api/v1/assets/onedrive/content?path=...',
        '/api/v1/catalog/workspaces/:workspaceId',
        '/api/v1/catalog/systems/:systemId',
        '/api/v1/catalog/systems',
        '/api/v1/catalog/modules',
        '/api/v1/catalog/actions',
        '/api/v1/manuals',
        '/api/v1/manuals/action/:actionId',
        '/api/v1/manuals/:manualId',
        '/api/v1/manuals/:manualId/steps/from-capture',
        '/api/v1/manuals/steps/:stepId',
        '/api/v1/capture-sessions',
        '/api/v1/capture-sessions/:sessionId',
        '/api/v1/capture-sessions/:sessionId/captures',
        '/api/v1/capture-sessions/captures/:captureId',
      ],
      nextStage: [
        'Administracion visual de usuarios y roles',
        'Conexion directa de la extension al backend con sesiones y capturas persistentes',
        'Endpoint de descarga autenticada por asset ID si se requiere control fino de acceso',
      ],
    };
  }
}
