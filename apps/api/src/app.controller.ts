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
      routes: [
        '/api/v1/catalog/workspace',
        '/api/v1/catalog/systems/:systemId',
        '/api/v1/catalog/systems',
        '/api/v1/catalog/modules',
        '/api/v1/catalog/actions',
        '/api/v1/manuals',
        '/api/v1/manuals/action/:actionId',
        '/api/v1/manuals/:manualId',
        '/api/v1/manuals/:manualId/steps/from-capture',
        '/api/v1/capture-sessions',
        '/api/v1/capture-sessions/:sessionId',
        '/api/v1/capture-sessions/:sessionId/captures',
        '/api/v1/capture-sessions/captures/:captureId',
      ],
      nextStage: [
        'Autenticacion CAS/OIDC',
        'Proveedor de almacenamiento OneDrive/SharePoint via Microsoft Graph',
        'Conexion directa de la extension al backend con sesiones y capturas persistentes',
      ],
    };
  }
}
