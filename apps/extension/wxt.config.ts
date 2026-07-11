import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'Manual Builder',
    description: 'Herramienta para seleccionar elementos y generar manuales de usuario.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Manual Builder',
    },
    browser_specific_settings: {
      gecko: {
        id: 'manual-builder@local',
      },
    },
  },
});
