import { MANUAL_DRAFT_STORAGE_KEY, createEmptyManualDraft, normalizeManualDraft, type ManualDraft } from './manual-builder';

type ManualDraftStorageShape = {
  [MANUAL_DRAFT_STORAGE_KEY]?: ManualDraft;
};

export async function loadManualDraft(): Promise<ManualDraft> {
  const result = await browser.storage.local.get<ManualDraftStorageShape>(MANUAL_DRAFT_STORAGE_KEY);
  return normalizeManualDraft(result[MANUAL_DRAFT_STORAGE_KEY] ?? createEmptyManualDraft());
}

export async function saveManualDraft(draft: ManualDraft): Promise<void> {
  await browser.storage.local.set<ManualDraftStorageShape>({
    [MANUAL_DRAFT_STORAGE_KEY]: normalizeManualDraft({
      ...draft,
      lastUpdatedAt: new Date().toISOString(),
    }),
  });
}

export async function resetManualDraft(): Promise<void> {
  await saveManualDraft(createEmptyManualDraft());
}
