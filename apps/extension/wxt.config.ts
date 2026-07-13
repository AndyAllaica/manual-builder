import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'Manual Builder',
    description: 'Herramienta para seleccionar elementos y generar manuales de usuario.',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Manual Builder',
    },
    commands: {
      'capture-visible-page': {
        suggested_key: {
          default: 'Alt+Shift+M',
        },
        description: 'Capturar la pantalla visible sin seleccionar un elemento',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'manual-builder@local',
      },
    },
  },
});
