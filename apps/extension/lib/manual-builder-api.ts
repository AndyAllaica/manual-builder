import type {
  CaptureTarget,
  SelectedElementData,
  SelectionRect,
  ViewportData,
} from './manual-builder';

export type RemoteManualImageFraming = 'context' | 'full';
export type RemoteCaptureStatus = 'pending' | 'approved' | 'discarded';
export type RemoteWorkspaceMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface RemoteStorageStatus {
  configuredProvider: string;
  activeProvider: 'local' | 'onedrive-business';
}

export interface RemoteAuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
}

export interface RemoteAuthResponse {
  user: RemoteAuthUser;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface RemoteWorkspaceRecord {
  id: string;
  name: string;
  description: string;
}

export interface RemoteWorkspaceMemberRecord {
  id: string;
  workspaceId: string;
  userId: string;
  username: string;
  displayName: string;
  role: RemoteWorkspaceMemberRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceOverview {
  workspace: RemoteWorkspaceRecord;
  totals: {
    systems: number;
    modules: number;
    actions: number;
    manuals: number;
  };
  systems: RemoteSystemSummary[];
}

export interface RemoteSystemSummary {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
  moduleCount: number;
  systemModules: RemoteSystemModuleSummary[];
}

export interface RemoteSystemModuleSummary {
  id: string;
  systemId: string;
  key: string;
  name: string;
  description: string;
  actionCount: number;
  actions: RemoteActionSummary[];
}

export interface RemoteActionSummary {
  id: string;
  moduleId: string;
  key: string;
  name: string;
  description: string;
  manualCount: number;
}

export interface RemoteCaptureSessionRecord {
  id: string;
  actionId: string;
  startedBy: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteCaptureRecord {
  id: string;
  sessionId: string;
  selector: string;
  pageTitle: string;
  pageUrl: string;
  selectedElementTag: string;
  textSnippet: string | null;
  title: string;
  description: string;
  framing: RemoteManualImageFraming;
  selectionRect: SelectionRect | null;
  viewport: ViewportData | null;
  captureTarget: CaptureTarget;
  status: RemoteCaptureStatus;
  originalAssetId: string;
  contextAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteManualRecord {
  id: string;
  actionId: string;
  title: string;
  description: string;
  status: string;
  currentVersionId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteManualStepRecord {
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
  framing: RemoteManualImageFraming;
  assetId: string;
  sourceCaptureId: string | null;
  createdAt: string;
}

export interface RemoteManualSummary {
  id: string;
  actionId: string;
  title: string;
  description: string;
  status: string;
  currentVersionId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: {
    id: string;
    versionLabel: string;
    status: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  };
  stepCount: number;
}

export interface CreateRemoteCaptureInput {
  selector: string;
  pageTitle: string;
  pageUrl: string;
  selectedElementTag: string;
  textSnippet?: string | null;
  title?: string;
  description?: string;
  framing?: RemoteManualImageFraming;
  selectionRect?: SelectionRect | null;
  viewport?: ViewportData | null;
  captureTarget?: CaptureTarget;
  originalImageDataUrl: string;
  contextImageDataUrl?: string | null;
}

export interface ReviewRemoteCaptureInput {
  status: RemoteCaptureStatus;
  title?: string;
  description?: string;
  framing?: RemoteManualImageFraming;
  contextImageDataUrl?: string | null;
}

export interface CreateRemoteManualInput {
  actionId: string;
  title: string;
  description?: string;
  createdBy: string;
  versionLabel?: string;
}

export interface CreateRemoteSystemInput {
  workspaceId: string;
  key?: string;
  name: string;
  description?: string;
}

export interface CreateRemoteSystemModuleInput {
  systemId: string;
  key?: string;
  name: string;
  description?: string;
}

export interface CreateRemoteActionInput {
  moduleId: string;
  key?: string;
  name: string;
  description?: string;
}

export interface AddRemoteStepFromCaptureInput {
  captureId: string;
  title?: string;
  description?: string;
  expectedResult?: string;
  framing?: RemoteManualImageFraming;
}

export interface UpdateRemoteManualStepInput {
  title?: string;
  description?: string;
  expectedResult?: string;
}

export interface DeleteRemoteManualStepResponse {
  stepId: string;
  manualId: string;
  versionId: string;
  deletedOrder: number;
  remainingStepCount: number;
}

export interface RemoteAssetRecord {
  id: string;
  provider: string;
  kind: string;
  mimeType: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RemoteManualVersionRecord {
  id: string;
  manualId: string;
  versionLabel: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteSystemRecord {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
}

export interface RemoteSystemModuleRecord {
  id: string;
  systemId: string;
  key: string;
  name: string;
  description: string;
}

export interface RemoteActionRecord {
  id: string;
  moduleId: string;
  key: string;
  name: string;
  description: string;
}

export type RemoteManualStepWithAsset = RemoteManualStepRecord & {
  asset: RemoteAssetRecord;
  sourceCapture: (RemoteCaptureRecord & {
    originalAsset: RemoteAssetRecord;
    contextAsset: RemoteAssetRecord | null;
  }) | null;
};

export interface RemoteManualDetail {
  manual: RemoteManualRecord;
  currentVersion: RemoteManualVersionRecord;
  action: RemoteActionRecord;
  systemModule: RemoteSystemModuleRecord;
  system: RemoteSystemRecord;
  steps: RemoteManualStepWithAsset[];
}

export interface RemoteSystemTree {
  system: RemoteSystemRecord;
  systemModules: Array<RemoteSystemModuleRecord & {
    actions: Array<RemoteActionRecord & {
      manuals: Array<{
        id: string;
        title: string;
        status: string;
        currentVersionId: string;
        updatedAt: string;
      }>;
    }>;
  }>;
}

interface CreateRemoteCaptureResponse {
  capture: RemoteCaptureRecord;
  originalAsset: RemoteAssetRecord;
  contextAsset: RemoteAssetRecord | null;
}

interface ReviewRemoteCaptureResponse {
  capture: RemoteCaptureRecord;
  originalAsset: RemoteAssetRecord;
  contextAsset: RemoteAssetRecord | null;
}

interface AddRemoteStepResponse {
  step: RemoteManualStepRecord;
  asset: RemoteAssetRecord;
}

export interface ManualBuilderApiClient {
  readonly baseUrl: string;
  login(input: { username: string; password: string }): Promise<RemoteAuthResponse>;
  register(input: { username: string; password: string; displayName?: string }): Promise<RemoteAuthResponse>;
  getCurrentUser(): Promise<{ user: RemoteAuthUser }>;
  getStorageStatus(): Promise<RemoteStorageStatus>;
  listWorkspaces(): Promise<RemoteWorkspaceRecord[]>;
  createWorkspace(input: { name: string; description?: string }): Promise<RemoteWorkspaceRecord>;
  listWorkspaceMembers(workspaceId: string): Promise<RemoteWorkspaceMemberRecord[]>;
  addWorkspaceMember(
    workspaceId: string,
    input: { username: string; role?: RemoteWorkspaceMemberRole },
  ): Promise<RemoteWorkspaceMemberRecord>;
  getWorkspaceOverview(workspaceId: string): Promise<WorkspaceOverview>;
  getSystemTree(systemId: string): Promise<RemoteSystemTree>;
  listManualsByAction(actionId: string): Promise<RemoteManualSummary[]>;
  createSystem(input: CreateRemoteSystemInput): Promise<RemoteSystemSummary>;
  createSystemModule(input: CreateRemoteSystemModuleInput): Promise<RemoteSystemModuleSummary>;
  createAction(input: CreateRemoteActionInput): Promise<RemoteActionSummary>;
  createCaptureSession(input: { actionId: string; startedBy: string }): Promise<RemoteCaptureSessionRecord>;
  createCapture(
    sessionId: string,
    input: CreateRemoteCaptureInput,
  ): Promise<CreateRemoteCaptureResponse>;
  reviewCapture(
    captureId: string,
    input: ReviewRemoteCaptureInput,
  ): Promise<ReviewRemoteCaptureResponse>;
  createManual(input: CreateRemoteManualInput): Promise<RemoteManualRecord>;
  getManual(manualId: string): Promise<RemoteManualDetail>;
  addStepFromCapture(
    manualId: string,
    input: AddRemoteStepFromCaptureInput,
  ): Promise<AddRemoteStepResponse>;
  updateManualStep(
    stepId: string,
    input: UpdateRemoteManualStepInput,
  ): Promise<AddRemoteStepResponse>;
  deleteManualStep(stepId: string): Promise<DeleteRemoteManualStepResponse>;
}

export function createManualBuilderApiClient(apiBaseUrl: string, authToken?: string | null): ManualBuilderApiClient {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);

  return {
    baseUrl,
    login: (input) =>
      requestJson<RemoteAuthResponse>(baseUrl, '/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    register: (input) =>
      requestJson<RemoteAuthResponse>(baseUrl, '/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    getCurrentUser: () => requestJson<{ user: RemoteAuthUser }>(baseUrl, '/auth/me', undefined, authToken),
    getStorageStatus: () => requestJson<RemoteStorageStatus>(baseUrl, '/assets/storage/status'),
    listWorkspaces: () => requestJson<RemoteWorkspaceRecord[]>(baseUrl, '/workspaces', undefined, authToken),
    createWorkspace: (input) =>
      requestJson<RemoteWorkspaceRecord>(baseUrl, '/workspaces', {
        method: 'POST',
        body: JSON.stringify(input),
      }, authToken),
    listWorkspaceMembers: (workspaceId) =>
      requestJson<RemoteWorkspaceMemberRecord[]>(
        baseUrl,
        `/workspaces/${encodeURIComponent(workspaceId)}/members`,
        undefined,
        authToken,
      ),
    addWorkspaceMember: (workspaceId, input) =>
      requestJson<RemoteWorkspaceMemberRecord>(
        baseUrl,
        `/workspaces/${encodeURIComponent(workspaceId)}/members`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        authToken,
      ),
    getWorkspaceOverview: (workspaceId) =>
      requestJson<WorkspaceOverview>(
        baseUrl,
        `/catalog/workspaces/${encodeURIComponent(workspaceId)}`,
        undefined,
        authToken,
      ),
    getSystemTree: (systemId) =>
      requestJson<RemoteSystemTree>(
        baseUrl,
        `/catalog/systems/${encodeURIComponent(systemId)}`,
        undefined,
        authToken,
      ),
    listManualsByAction: (actionId) =>
      requestJson<RemoteManualSummary[]>(
        baseUrl,
        `/manuals/action/${encodeURIComponent(actionId)}`,
        undefined,
        authToken,
      ),
    createSystem: (input) =>
      requestJson<RemoteSystemSummary>(baseUrl, '/catalog/systems', {
        method: 'POST',
        body: JSON.stringify(input),
      }, authToken),
    createSystemModule: (input) =>
      requestJson<RemoteSystemModuleSummary>(baseUrl, '/catalog/modules', {
        method: 'POST',
        body: JSON.stringify(input),
      }, authToken),
    createAction: (input) =>
      requestJson<RemoteActionSummary>(baseUrl, '/catalog/actions', {
        method: 'POST',
        body: JSON.stringify(input),
      }, authToken),
    createCaptureSession: (input) =>
      requestJson<RemoteCaptureSessionRecord>(baseUrl, '/capture-sessions', {
        method: 'POST',
        body: JSON.stringify(input),
      }, authToken),
    createCapture: (sessionId, input) =>
      requestJson<CreateRemoteCaptureResponse>(
        baseUrl,
        `/capture-sessions/${encodeURIComponent(sessionId)}/captures`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        authToken,
      ),
    reviewCapture: (captureId, input) =>
      requestJson<ReviewRemoteCaptureResponse>(
        baseUrl,
        `/capture-sessions/captures/${encodeURIComponent(captureId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
        authToken,
      ),
    createManual: (input) =>
      requestJson<RemoteManualRecord>(baseUrl, '/manuals', {
        method: 'POST',
        body: JSON.stringify(input),
      }, authToken),
    getManual: (manualId) =>
      requestJson<RemoteManualDetail>(
        baseUrl,
        `/manuals/${encodeURIComponent(manualId)}`,
        undefined,
        authToken,
      ),
    addStepFromCapture: (manualId, input) =>
      requestJson<AddRemoteStepResponse>(
        baseUrl,
        `/manuals/${encodeURIComponent(manualId)}/steps/from-capture`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        authToken,
      ),
    updateManualStep: (stepId, input) =>
      requestJson<AddRemoteStepResponse>(
        baseUrl,
        `/manuals/steps/${encodeURIComponent(stepId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
        authToken,
      ),
    deleteManualStep: (stepId) =>
      requestJson<DeleteRemoteManualStepResponse>(
        baseUrl,
        `/manuals/steps/${encodeURIComponent(stepId)}`,
        {
          method: 'DELETE',
        },
        authToken,
      ),
  };
}

export function buildRemoteCapturePayload(
  selectedElement: SelectedElementData,
  imageDataUrl: string,
  title: string,
  captureTarget: CaptureTarget = 'element',
): CreateRemoteCaptureInput {
  return {
    selector: selectedElement.selector,
    pageTitle: selectedElement.pageTitle,
    pageUrl: selectedElement.url,
    selectedElementTag: selectedElement.tagName.toLowerCase(),
    textSnippet: selectedElement.text,
    title,
    description: '',
    framing: 'context',
    selectionRect: selectedElement.rect,
    viewport: selectedElement.viewport,
    captureTarget,
    originalImageDataUrl: imageDataUrl,
  };
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error('Ingresa la URL base del backend.');
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmedValue) ? trimmedValue : `http://${trimmedValue}`;
  const parsedUrl = new URL(withProtocol);
  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');

  if (/\/api\/v\d+$/i.test(normalizedPath)) {
    parsedUrl.pathname = normalizedPath;
  } else if (/\/api$/i.test(normalizedPath)) {
    parsedUrl.pathname = `${normalizedPath}/v1`;
  } else {
    parsedUrl.pathname = `${normalizedPath}/api/v1`.replace(/\/{2,}/g, '/');
  }

  parsedUrl.search = '';
  parsedUrl.hash = '';
  return parsedUrl.toString().replace(/\/$/, '');
}

async function requestJson<TResponse>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  authToken?: string | null,
): Promise<TResponse> {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  if (authToken !== undefined && authToken !== null && authToken.trim().length > 0) {
    headers.set('authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response));
  }

  return response.json() as Promise<TResponse>;
}

async function buildHttpErrorMessage(response: Response): Promise<string> {
  const fallback = `Backend respondio con ${response.status} ${response.statusText || 'Error'}.`;

  try {
    const payload = await response.json() as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(payload.message)) {
      return payload.message.join(' | ');
    }

    if (typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }

    if (typeof payload.error === 'string' && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
