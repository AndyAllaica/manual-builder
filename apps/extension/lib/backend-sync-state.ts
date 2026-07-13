import {
  BACKEND_SYNC_SETTINGS_STORAGE_KEY,
  createEmptyBackendSyncSettings,
  normalizeBackendSyncSettings,
  type BackendSyncSettings,
} from './manual-builder';

type BackendSyncSettingsStorageShape = {
  [BACKEND_SYNC_SETTINGS_STORAGE_KEY]?: BackendSyncSettings;
};

export async function loadBackendSyncSettings(): Promise<BackendSyncSettings> {
  const result = await browser.storage.local.get<BackendSyncSettingsStorageShape>(
    BACKEND_SYNC_SETTINGS_STORAGE_KEY,
  );

  return normalizeBackendSyncSettings(
    result[BACKEND_SYNC_SETTINGS_STORAGE_KEY] ?? createEmptyBackendSyncSettings(),
  );
}

export async function saveBackendSyncSettings(settings: BackendSyncSettings): Promise<void> {
  await browser.storage.local.set<BackendSyncSettingsStorageShape>({
    [BACKEND_SYNC_SETTINGS_STORAGE_KEY]: normalizeBackendSyncSettings(settings),
  });
}

export async function resetBackendSyncSettings(): Promise<void> {
  await saveBackendSyncSettings(createEmptyBackendSyncSettings());
}
