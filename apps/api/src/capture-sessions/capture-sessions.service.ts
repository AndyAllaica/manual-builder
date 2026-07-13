import { Inject, Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../auth/auth.types';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import {
  type CreateCaptureInput,
  type CreateCaptureSessionInput,
  type ReviewCaptureInput,
} from '../domain/manual-builder.types';
import {
  ASSET_STORAGE_SERVICE,
  type AssetStorageService,
  type StoredAssetMetadata,
} from '../storage/asset-storage.types';

@Injectable()
export class CaptureSessionsService {
  constructor(
    private readonly repository: ManualBuilderRepository,
    @Inject(ASSET_STORAGE_SERVICE)
    private readonly assetStorageService: AssetStorageService,
  ) {}

  async listCaptureSessions(user: AuthenticatedUser, actionId?: string) {
    const sessions = actionId === undefined
      ? await this.repository.listCaptureSessionsForUser(user.id)
      : await this.listCaptureSessionsByAction(user, actionId);

    return Promise.all(sessions.map(async (session) => ({
      ...session,
      captures: await Promise.all((await this.repository.listCapturesBySessionId(session.id)).map(async (capture) => ({
        ...capture,
        originalAsset: await this.repository.findAssetById(capture.originalAssetId),
        contextAsset: capture.contextAssetId === null ? null : await this.repository.findAssetById(capture.contextAssetId),
      }))),
    })));
  }

  async getCaptureSession(user: AuthenticatedUser, sessionId: string) {
    await this.repository.ensureUserCanAccessWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByCaptureSessionId(sessionId),
    );

    const session = await this.repository.findCaptureSessionById(sessionId);
    const action = await this.repository.findActionById(session.actionId);
    const captures = await Promise.all((await this.repository.listCapturesBySessionId(session.id)).map(async (capture) => ({
      ...capture,
      originalAsset: await this.repository.findAssetById(capture.originalAssetId),
      contextAsset: capture.contextAssetId === null ? null : await this.repository.findAssetById(capture.contextAssetId),
    })));

    return {
      session,
      action,
      captures,
    };
  }

  async createCaptureSession(user: AuthenticatedUser, input: CreateCaptureSessionInput) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByActionId(input.actionId),
    );

    return this.repository.createCaptureSession({
      ...input,
      startedBy: user.displayName || user.username,
    });
  }

  async createCapture(user: AuthenticatedUser, sessionId: string, input: Omit<CreateCaptureInput, 'originalAsset' | 'contextAsset'> & {
    originalImageDataUrl: string;
    contextImageDataUrl?: string | null;
  }) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByCaptureSessionId(sessionId),
    );

    const storedOriginalAsset = await this.assetStorageService.saveCaptureAsset({
      sessionId,
      kind: 'original',
      dataUrl: input.originalImageDataUrl,
    });

    let storedContextAsset: StoredAssetMetadata | null = null;

    try {
      if (input.contextImageDataUrl !== undefined && input.contextImageDataUrl !== null) {
        storedContextAsset = await this.assetStorageService.saveCaptureAsset({
          sessionId,
          kind: 'context',
          dataUrl: input.contextImageDataUrl,
        });
      }

      const capture = await this.repository.createCapture(sessionId, {
        selector: input.selector,
        pageTitle: input.pageTitle,
        pageUrl: input.pageUrl,
        selectedElementTag: input.selectedElementTag,
        textSnippet: input.textSnippet,
        title: input.title,
        description: input.description,
        framing: input.framing,
        originalAsset: storedOriginalAsset,
        contextAsset: storedContextAsset,
      });

      return {
        capture,
        originalAsset: await this.repository.findAssetById(capture.originalAssetId),
        contextAsset: capture.contextAssetId === null ? null : await this.repository.findAssetById(capture.contextAssetId),
      };
    } catch (error) {
      await this.assetStorageService.deleteStoredAsset(storedOriginalAsset.storagePath);
      if (storedContextAsset !== null) {
        await this.assetStorageService.deleteStoredAsset(storedContextAsset.storagePath);
      }

      throw error;
    }
  }

  async reviewCapture(
    user: AuthenticatedUser,
    captureId: string,
    input: ReviewCaptureInput & { contextImageDataUrl?: string | null },
  ) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByCaptureId(captureId),
    );

    const existingCapture = await this.repository.findCaptureById(captureId);
    const previousContextAsset = existingCapture.contextAssetId === null
      ? null
      : await this.repository.findAssetById(existingCapture.contextAssetId);
    let storedContextAsset: StoredAssetMetadata | null = null;

    try {
      if (input.contextImageDataUrl !== null && input.contextImageDataUrl !== undefined) {
        storedContextAsset = await this.assetStorageService.saveCaptureAsset({
          sessionId: existingCapture.sessionId,
          kind: 'context',
          dataUrl: input.contextImageDataUrl,
        });
      }

      const capture = await this.repository.reviewCapture(captureId, {
        status: input.status,
        title: input.title,
        description: input.description,
        framing: input.framing,
        contextAsset: storedContextAsset,
      });

      if (storedContextAsset !== null && previousContextAsset !== null) {
        await this.assetStorageService.deleteStoredAsset(previousContextAsset.storagePath);
      }

      return {
        capture,
        originalAsset: await this.repository.findAssetById(capture.originalAssetId),
        contextAsset: capture.contextAssetId === null ? null : await this.repository.findAssetById(capture.contextAssetId),
      };
    } catch (error) {
      if (storedContextAsset !== null) {
        await this.assetStorageService.deleteStoredAsset(storedContextAsset.storagePath);
      }

      throw error;
    }
  }

  private async listCaptureSessionsByAction(user: AuthenticatedUser, actionId: string) {
    await this.repository.ensureUserCanAccessWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByActionId(actionId),
    );

    return this.repository.listCaptureSessions(actionId);
  }
}
