import { Injectable } from '@nestjs/common';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import {
  type CreateCaptureInput,
  type CreateCaptureSessionInput,
  type ReviewCaptureInput,
} from '../domain/manual-builder.types';
import { LocalAssetStorageService } from '../storage/local-asset-storage.service';

@Injectable()
export class CaptureSessionsService {
  constructor(
    private readonly repository: ManualBuilderRepository,
    private readonly localAssetStorageService: LocalAssetStorageService,
  ) {}

  async listCaptureSessions(actionId?: string) {
    const sessions = await this.repository.listCaptureSessions(actionId);

    return Promise.all(sessions.map(async (session) => ({
      ...session,
      captures: await Promise.all((await this.repository.listCapturesBySessionId(session.id)).map(async (capture) => ({
        ...capture,
        originalAsset: await this.repository.findAssetById(capture.originalAssetId),
        contextAsset: capture.contextAssetId === null ? null : await this.repository.findAssetById(capture.contextAssetId),
      }))),
    })));
  }

  async getCaptureSession(sessionId: string) {
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

  createCaptureSession(input: CreateCaptureSessionInput) {
    return this.repository.createCaptureSession(input);
  }

  async createCapture(sessionId: string, input: Omit<CreateCaptureInput, 'originalAsset' | 'contextAsset'> & {
    originalImageDataUrl: string;
    contextImageDataUrl?: string | null;
  }) {
    const storedOriginalAsset = await this.localAssetStorageService.saveCaptureAsset({
      sessionId,
      kind: 'original',
      dataUrl: input.originalImageDataUrl,
    });

    let storedContextAsset: Awaited<ReturnType<LocalAssetStorageService['saveCaptureAsset']>> | null = null;

    try {
      if (input.contextImageDataUrl !== undefined && input.contextImageDataUrl !== null) {
        storedContextAsset = await this.localAssetStorageService.saveCaptureAsset({
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
      await this.localAssetStorageService.deleteStoredAsset(storedOriginalAsset.storagePath);
      if (storedContextAsset !== null) {
        await this.localAssetStorageService.deleteStoredAsset(storedContextAsset.storagePath);
      }

      throw error;
    }
  }

  async reviewCapture(captureId: string, input: ReviewCaptureInput) {
    const capture = await this.repository.reviewCapture(captureId, input);

    return {
      capture,
      originalAsset: await this.repository.findAssetById(capture.originalAssetId),
      contextAsset: capture.contextAssetId === null ? null : await this.repository.findAssetById(capture.contextAssetId),
    };
  }
}
