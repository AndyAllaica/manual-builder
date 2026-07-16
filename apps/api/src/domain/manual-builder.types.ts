export type AssetStorageProvider = 'local' | 'onedrive-business' | 'sharepoint-library';
export type ManualImageFraming = 'context' | 'full';
export type CaptureTarget = 'element' | 'viewport';
export type CaptureReviewStatus = 'pending' | 'approved' | 'discarded';
export type CaptureSessionStatus = 'open' | 'in_review' | 'closed';
export type ManualStatus = 'draft' | 'published' | 'archived';
export type ManualVersionStatus = 'draft' | 'published' | 'archived';
export type UserStatus = 'active' | 'disabled';
export type WorkspaceMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithPasswordRecord extends UserRecord {
  passwordHash: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  description: string;
}

export interface WorkspaceMemberRecord {
  id: string;
  workspaceId: string;
  userId: string;
  username: string;
  displayName: string;
  role: WorkspaceMemberRole;
  createdAt: string;
  updatedAt: string;
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
  selectionRect: CaptureSelectionRect | null;
  viewport: CaptureViewport | null;
  captureTarget: CaptureTarget;
  status: CaptureReviewStatus;
  originalAssetId: string;
  contextAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
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
  expectedResult: string;
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

export interface CreateUserInput {
  username: string;
  displayName?: string;
  email?: string | null;
  passwordHash: string;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  ownerUserId: string;
}

export interface AddWorkspaceMemberInput {
  username: string;
  role: WorkspaceMemberRole;
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
  selectionRect?: CaptureSelectionRect | null;
  viewport?: CaptureViewport | null;
  captureTarget?: CaptureTarget;
  originalAsset: StoredAssetInput;
  contextAsset?: StoredAssetInput | null;
}

export interface ReviewCaptureInput {
  status: CaptureReviewStatus;
  title?: string;
  description?: string;
  framing?: ManualImageFraming;
  contextAsset?: StoredAssetInput | null;
}

export interface AddStepFromCaptureInput {
  captureId: string;
  title?: string;
  description?: string;
  expectedResult?: string;
  framing?: ManualImageFraming;
}

export interface UpdateManualStepInput {
  title?: string;
  description?: string;
  expectedResult?: string;
}

export interface DeleteManualStepResult {
  stepId: string;
  manualId: string;
  versionId: string;
  deletedOrder: number;
  remainingStepCount: number;
}
