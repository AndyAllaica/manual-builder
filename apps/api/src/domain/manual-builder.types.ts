export type AssetStorageProvider = 'local' | 'onedrive-business' | 'sharepoint-library';
export type ManualImageFraming = 'context' | 'full';
export type CaptureReviewStatus = 'pending' | 'approved' | 'discarded';
export type CaptureSessionStatus = 'open' | 'in_review' | 'closed';
export type ManualStatus = 'draft' | 'published' | 'archived';
export type ManualVersionStatus = 'draft' | 'published' | 'archived';

export interface WorkspaceRecord {
  id: string;
  name: string;
  description: string;
}

export interface SystemRecord {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
}

export interface SystemModuleRecord {
  id: string;
  systemId: string;
  key: string;
  name: string;
  description: string;
}

export interface ActionRecord {
  id: string;
  moduleId: string;
  key: string;
  name: string;
  description: string;
}

export interface AssetRecord {
  id: string;
  provider: AssetStorageProvider;
  kind: 'original' | 'context';
  mimeType: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CaptureSessionRecord {
  id: string;
  actionId: string;
  startedBy: string;
  status: CaptureSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureRecord {
  id: string;
  sessionId: string;
  selector: string;
  pageTitle: string;
  pageUrl: string;
  selectedElementTag: string;
  textSnippet: string | null;
  title: string;
  description: string;
  framing: ManualImageFraming;
  status: CaptureReviewStatus;
  originalAssetId: string;
  contextAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualRecord {
  id: string;
  actionId: string;
  title: string;
  description: string;
  status: ManualStatus;
  currentVersionId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualVersionRecord {
  id: string;
  manualId: string;
  versionLabel: string;
  status: ManualVersionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualStepRecord {
  id: string;
  versionId: string;
  order: number;
  title: string;
  description: string;
  selector: string;
  pageTitle: string;
  pageUrl: string;
  selectedElementTag: string;
  textSnippet: string | null;
  framing: ManualImageFraming;
  assetId: string;
  sourceCaptureId: string | null;
  createdAt: string;
}

export interface StoredAssetInput {
  provider: AssetStorageProvider;
  mimeType: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  sizeBytes: number;
}

export interface CreateSystemInput {
  workspaceId: string;
  key?: string;
  name: string;
  description?: string;
}

export interface CreateSystemModuleInput {
  systemId: string;
  key?: string;
  name: string;
  description?: string;
}

export interface CreateActionInput {
  moduleId: string;
  key?: string;
  name: string;
  description?: string;
}

export interface CreateManualInput {
  actionId: string;
  title: string;
  description?: string;
  createdBy: string;
  versionLabel?: string;
}

export interface CreateCaptureSessionInput {
  actionId: string;
  startedBy: string;
}

export interface CreateCaptureInput {
  selector: string;
  pageTitle: string;
  pageUrl: string;
  selectedElementTag: string;
  textSnippet: string | null;
  title?: string;
  description?: string;
  framing: ManualImageFraming;
  originalAsset: StoredAssetInput;
  contextAsset?: StoredAssetInput | null;
}

export interface ReviewCaptureInput {
  status: CaptureReviewStatus;
  title?: string;
  description?: string;
  framing?: ManualImageFraming;
}

export interface AddStepFromCaptureInput {
  captureId: string;
  title?: string;
  description?: string;
  framing?: ManualImageFraming;
}
