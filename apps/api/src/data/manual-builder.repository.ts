import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  ActionEntity,
  AssetEntity,
  CaptureEntity,
  CaptureSessionEntity,
  ManualEntity,
  ManualStepEntity,
  ManualVersionEntity,
  SystemEntity,
  SystemModuleEntity,
  WorkspaceEntity,
} from '../database/entities';
import {
  type ActionRecord,
  type AddStepFromCaptureInput,
  type AssetRecord,
  type CaptureRecord,
  type CaptureSessionRecord,
  type CreateActionInput,
  type CreateCaptureInput,
  type CreateCaptureSessionInput,
  type CreateManualInput,
  type CreateSystemInput,
  type CreateSystemModuleInput,
  type ManualRecord,
  type ManualStepRecord,
  type ManualVersionRecord,
  type ReviewCaptureInput,
  type SystemModuleRecord,
  type SystemRecord,
  type WorkspaceRecord,
} from '../domain/manual-builder.types';

@Injectable()
export class ManualBuilderRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(SystemEntity)
    private readonly systemRepository: Repository<SystemEntity>,
    @InjectRepository(SystemModuleEntity)
    private readonly systemModuleRepository: Repository<SystemModuleEntity>,
    @InjectRepository(ActionEntity)
    private readonly actionRepository: Repository<ActionEntity>,
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
    @InjectRepository(CaptureSessionEntity)
    private readonly captureSessionRepository: Repository<CaptureSessionEntity>,
    @InjectRepository(CaptureEntity)
    private readonly captureRepository: Repository<CaptureEntity>,
    @InjectRepository(ManualEntity)
    private readonly manualRepository: Repository<ManualEntity>,
    @InjectRepository(ManualVersionEntity)
    private readonly manualVersionRepository: Repository<ManualVersionEntity>,
    @InjectRepository(ManualStepEntity)
    private readonly manualStepRepository: Repository<ManualStepEntity>,
  ) {}

  async getWorkspace(): Promise<WorkspaceRecord> {
    const workspace = await this.workspaceRepository.findOne({
      order: { createdAt: 'ASC' },
    });

    if (workspace === null) {
      throw new NotFoundException('No existe ningun espacio de trabajo configurado.');
    }

    return toWorkspaceRecord(workspace);
  }

  async listSystems(): Promise<SystemRecord[]> {
    const systems = await this.systemRepository.find({
      order: { name: 'ASC' },
    });

    return systems.map(toSystemRecord);
  }

  async findSystemById(systemId: string): Promise<SystemRecord> {
    const system = await this.systemRepository.findOneBy({ id: systemId });
    if (system === null) {
      throw new NotFoundException(`Sistema no encontrado: ${systemId}`);
    }

    return toSystemRecord(system);
  }

  async listSystemModulesBySystemId(systemId: string): Promise<SystemModuleRecord[]> {
    const systemModules = await this.systemModuleRepository.find({
      where: { systemId },
      order: { name: 'ASC' },
    });

    return systemModules.map(toSystemModuleRecord);
  }

  async findSystemModuleById(moduleId: string): Promise<SystemModuleRecord> {
    const systemModule = await this.systemModuleRepository.findOneBy({ id: moduleId });
    if (systemModule === null) {
      throw new NotFoundException(`Modulo no encontrado: ${moduleId}`);
    }

    return toSystemModuleRecord(systemModule);
  }

  async listActionsByModuleId(moduleId: string): Promise<ActionRecord[]> {
    const actions = await this.actionRepository.find({
      where: { moduleId },
      order: { name: 'ASC' },
    });

    return actions.map(toActionRecord);
  }

  async findActionById(actionId: string): Promise<ActionRecord> {
    const action = await this.actionRepository.findOneBy({ id: actionId });
    if (action === null) {
      throw new NotFoundException(`Accion no encontrada: ${actionId}`);
    }

    return toActionRecord(action);
  }

  async listManualsByActionId(actionId: string): Promise<ManualRecord[]> {
    const manuals = await this.manualRepository.find({
      where: { actionId },
      order: { updatedAt: 'DESC' },
    });

    return manuals
      .filter((manual) => manual.currentVersionId !== null)
      .map(toManualRecord);
  }

  async findManualById(manualId: string): Promise<ManualRecord> {
    const manual = await this.manualRepository.findOneBy({ id: manualId });
    if (manual === null || manual.currentVersionId === null) {
      throw new NotFoundException(`Manual no encontrado: ${manualId}`);
    }

    return toManualRecord(manual);
  }

  async listManualVersionsByManualId(manualId: string): Promise<ManualVersionRecord[]> {
    const versions = await this.manualVersionRepository.find({
      where: { manualId },
      order: { createdAt: 'DESC' },
    });

    return versions.map(toManualVersionRecord);
  }

  async findManualVersionById(versionId: string): Promise<ManualVersionRecord> {
    const version = await this.manualVersionRepository.findOneBy({ id: versionId });
    if (version === null) {
      throw new NotFoundException(`Version no encontrada: ${versionId}`);
    }

    return toManualVersionRecord(version);
  }

  async listManualStepsByVersionId(versionId: string): Promise<ManualStepRecord[]> {
    const steps = await this.manualStepRepository.find({
      where: { versionId },
      order: { order: 'ASC' },
    });

    return steps.map(toManualStepRecord);
  }

  async listCaptureSessions(actionId?: string): Promise<CaptureSessionRecord[]> {
    const sessions = await this.captureSessionRepository.find({
      where: actionId === undefined ? {} : { actionId },
      order: { updatedAt: 'DESC' },
    });

    return sessions.map(toCaptureSessionRecord);
  }

  async findCaptureSessionById(sessionId: string): Promise<CaptureSessionRecord> {
    const session = await this.captureSessionRepository.findOneBy({ id: sessionId });
    if (session === null) {
      throw new NotFoundException(`Sesion de captura no encontrada: ${sessionId}`);
    }

    return toCaptureSessionRecord(session);
  }

  async listCapturesBySessionId(sessionId: string): Promise<CaptureRecord[]> {
    const captures = await this.captureRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    return captures.map(toCaptureRecord);
  }

  async findCaptureById(captureId: string): Promise<CaptureRecord> {
    const capture = await this.captureRepository.findOneBy({ id: captureId });
    if (capture === null) {
      throw new NotFoundException(`Captura no encontrada: ${captureId}`);
    }

    return toCaptureRecord(capture);
  }

  async findAssetById(assetId: string): Promise<AssetRecord> {
    const asset = await this.assetRepository.findOneBy({ id: assetId });
    if (asset === null) {
      throw new NotFoundException(`Asset no encontrado: ${assetId}`);
    }

    return toAssetRecord(asset);
  }

  async createSystem(input: CreateSystemInput): Promise<SystemRecord> {
    await this.ensureWorkspaceExists(input.workspaceId);

    const system = this.systemRepository.create({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      key: normalizeKey(input.key ?? input.name),
      name: normalizeRequiredText(input.name, 'El nombre del sistema es obligatorio.'),
      description: normalizeOptionalText(input.description) ?? '',
    });

    try {
      await this.systemRepository.save(system);
      return toSystemRecord(system);
    } catch (error) {
      throw normalizePersistenceError(error, 'Ya existe un sistema con esa clave en el workspace indicado.');
    }
  }

  async createSystemModule(input: CreateSystemModuleInput): Promise<SystemModuleRecord> {
    await this.ensureSystemExists(input.systemId);

    const systemModule = this.systemModuleRepository.create({
      id: randomUUID(),
      systemId: input.systemId,
      key: normalizeKey(input.key ?? input.name),
      name: normalizeRequiredText(input.name, 'El nombre del modulo es obligatorio.'),
      description: normalizeOptionalText(input.description) ?? '',
    });

    try {
      await this.systemModuleRepository.save(systemModule);
      return toSystemModuleRecord(systemModule);
    } catch (error) {
      throw normalizePersistenceError(error, 'Ya existe un modulo con esa clave para el sistema indicado.');
    }
  }

  async createAction(input: CreateActionInput): Promise<ActionRecord> {
    await this.ensureSystemModuleExists(input.moduleId);

    const action = this.actionRepository.create({
      id: randomUUID(),
      moduleId: input.moduleId,
      key: normalizeKey(input.key ?? input.name),
      name: normalizeRequiredText(input.name, 'El nombre de la accion es obligatorio.'),
      description: normalizeOptionalText(input.description) ?? '',
    });

    try {
      await this.actionRepository.save(action);
      return toActionRecord(action);
    } catch (error) {
      throw normalizePersistenceError(error, 'Ya existe una accion con esa clave para el modulo indicado.');
    }
  }

  async createManual(input: CreateManualInput): Promise<ManualRecord> {
    await this.ensureActionExists(input.actionId);

    return this.dataSource.transaction(async (manager) => {
      const timestamp = new Date();
      const manual = manager.create(ManualEntity, {
        id: randomUUID(),
        actionId: input.actionId,
        title: normalizeRequiredText(input.title, 'El titulo del manual es obligatorio.'),
        description: normalizeOptionalText(input.description) ?? '',
        status: 'draft',
        currentVersionId: null,
        createdBy: normalizeRequiredText(input.createdBy, 'El usuario creador del manual es obligatorio.'),
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await manager.save(manual);

      const version = manager.create(ManualVersionEntity, {
        id: randomUUID(),
        manualId: manual.id,
        versionLabel: normalizeOptionalText(input.versionLabel) ?? '1.0.0-draft',
        status: 'draft',
        createdBy: manual.createdBy,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await manager.save(version);

      manual.currentVersionId = version.id;
      manual.updatedAt = new Date();
      await manager.save(manual);

      return toManualRecord(manual);
    });
  }

  async createCaptureSession(input: CreateCaptureSessionInput): Promise<CaptureSessionRecord> {
    await this.ensureActionExists(input.actionId);

    const session = this.captureSessionRepository.create({
      id: randomUUID(),
      actionId: input.actionId,
      startedBy: normalizeRequiredText(input.startedBy, 'El usuario que inicia la sesion es obligatorio.'),
      status: 'open',
    });

    await this.captureSessionRepository.save(session);
    return toCaptureSessionRecord(session);
  }

  async createCapture(sessionId: string, input: CreateCaptureInput): Promise<CaptureRecord> {
    await this.ensureCaptureSessionExists(sessionId);

    return this.dataSource.transaction(async (manager) => {
      const originalAsset = manager.create(AssetEntity, {
        id: randomUUID(),
        provider: input.originalAsset.provider,
        kind: 'original',
        mimeType: input.originalAsset.mimeType,
        fileName: input.originalAsset.fileName,
        storagePath: input.originalAsset.storagePath,
        publicUrl: input.originalAsset.publicUrl,
        sizeBytes: input.originalAsset.sizeBytes,
      });

      await manager.save(originalAsset);

      let contextAsset: AssetEntity | null = null;
      if (input.contextAsset !== null && input.contextAsset !== undefined) {
        contextAsset = manager.create(AssetEntity, {
          id: randomUUID(),
          provider: input.contextAsset.provider,
          kind: 'context',
          mimeType: input.contextAsset.mimeType,
          fileName: input.contextAsset.fileName,
          storagePath: input.contextAsset.storagePath,
          publicUrl: input.contextAsset.publicUrl,
          sizeBytes: input.contextAsset.sizeBytes,
        });

        await manager.save(contextAsset);
      }

      const capture = manager.create(CaptureEntity, {
        id: randomUUID(),
        sessionId,
        selector: normalizeRequiredText(input.selector, 'El selector del elemento es obligatorio.'),
        pageTitle: normalizeRequiredText(input.pageTitle, 'El titulo de pagina es obligatorio.'),
        pageUrl: normalizeRequiredText(input.pageUrl, 'La URL de pagina es obligatoria.'),
        selectedElementTag: normalizeRequiredText(input.selectedElementTag, 'La etiqueta del elemento seleccionado es obligatoria.').toLowerCase(),
        textSnippet: normalizeOptionalText(input.textSnippet),
        title: normalizeOptionalText(input.title)
          ?? buildCaptureTitle(input.selectedElementTag, input.textSnippet, input.pageTitle),
        description: normalizeOptionalText(input.description) ?? '',
        framing: input.framing,
        status: 'pending',
        originalAssetId: originalAsset.id,
        contextAssetId: contextAsset?.id ?? null,
      });

      await manager.save(capture);
      await manager.update(CaptureSessionEntity, { id: sessionId }, {
        status: 'in_review',
        updatedAt: new Date(),
      });

      return toCaptureRecord(capture);
    });
  }

  async reviewCapture(captureId: string, input: ReviewCaptureInput): Promise<CaptureRecord> {
    return this.dataSource.transaction(async (manager) => {
      const capture = await manager.findOne(CaptureEntity, {
        where: { id: captureId },
      });

      if (capture === null) {
        throw new NotFoundException(`Captura no encontrada: ${captureId}`);
      }

      capture.status = input.status;
      capture.title = normalizeOptionalText(input.title) ?? capture.title;
      capture.description = normalizeOptionalText(input.description) ?? capture.description;
      capture.framing = input.framing ?? capture.framing;
      capture.updatedAt = new Date();

      await manager.save(capture);

      const pendingCaptures = await manager.count(CaptureEntity, {
        where: { sessionId: capture.sessionId, status: 'pending' },
      });

      await manager.update(CaptureSessionEntity, { id: capture.sessionId }, {
        status: pendingCaptures === 0 ? 'closed' : 'in_review',
        updatedAt: new Date(),
      });

      return toCaptureRecord(capture);
    });
  }

  async addStepFromCapture(manualId: string, input: AddStepFromCaptureInput): Promise<ManualStepRecord> {
    return this.dataSource.transaction(async (manager) => {
      const manual = await manager.findOne(ManualEntity, {
        where: { id: manualId },
      });

      if (manual === null || manual.currentVersionId === null) {
        throw new NotFoundException(`Manual no encontrado: ${manualId}`);
      }

      const version = await manager.findOne(ManualVersionEntity, {
        where: { id: manual.currentVersionId },
      });
      if (version === null) {
        throw new NotFoundException(`Version no encontrada: ${manual.currentVersionId}`);
      }

      const capture = await manager.findOne(CaptureEntity, {
        where: { id: input.captureId },
      });
      if (capture === null) {
        throw new NotFoundException(`Captura no encontrada: ${input.captureId}`);
      }

      if (capture.status === 'discarded') {
        throw new ConflictException('No se puede convertir una captura descartada en paso del manual.');
      }

      const requestedFraming = input.framing ?? capture.framing;
      const selectedAssetId = requestedFraming === 'context' && capture.contextAssetId !== null
        ? capture.contextAssetId
        : capture.originalAssetId;
      const nextOrder = (await manager.count(ManualStepEntity, {
        where: { versionId: version.id },
      })) + 1;

      const step = manager.create(ManualStepEntity, {
        id: randomUUID(),
        versionId: version.id,
        order: nextOrder,
        title: normalizeOptionalText(input.title) ?? capture.title ?? `Paso ${nextOrder}`,
        description: normalizeOptionalText(input.description) ?? capture.description,
        selector: capture.selector,
        pageTitle: capture.pageTitle,
        pageUrl: capture.pageUrl,
        selectedElementTag: capture.selectedElementTag,
        textSnippet: capture.textSnippet,
        framing: requestedFraming,
        assetId: selectedAssetId,
        sourceCaptureId: capture.id,
      });

      capture.status = 'approved';
      capture.updatedAt = new Date();
      manual.updatedAt = new Date();
      version.updatedAt = new Date();

      await manager.save(step);
      await manager.save(capture);
      await manager.save(version);
      await manager.save(manual);

      const pendingCaptures = await manager.count(CaptureEntity, {
        where: { sessionId: capture.sessionId, status: 'pending' },
      });

      await manager.update(CaptureSessionEntity, { id: capture.sessionId }, {
        status: pendingCaptures === 0 ? 'closed' : 'in_review',
        updatedAt: new Date(),
      });

      return toManualStepRecord(step);
    });
  }

  private async ensureWorkspaceExists(workspaceId: string): Promise<void> {
    await this.ensureEntityExists(this.workspaceRepository, workspaceId, 'Workspace');
  }

  private async ensureSystemExists(systemId: string): Promise<void> {
    await this.ensureEntityExists(this.systemRepository, systemId, 'Sistema');
  }

  private async ensureSystemModuleExists(moduleId: string): Promise<void> {
    await this.ensureEntityExists(this.systemModuleRepository, moduleId, 'Modulo');
  }

  private async ensureActionExists(actionId: string): Promise<void> {
    await this.ensureEntityExists(this.actionRepository, actionId, 'Accion');
  }

  private async ensureCaptureSessionExists(sessionId: string): Promise<void> {
    await this.ensureEntityExists(this.captureSessionRepository, sessionId, 'Sesion de captura');
  }

  private async ensureEntityExists<TRecord extends { id: string }>(
    repository: Repository<TRecord>,
    id: string,
    entityLabel: string,
  ): Promise<void> {
    const count = await repository.count({
      where: { id } as never,
    });

    if (count === 0) {
      throw new NotFoundException(`${entityLabel} no encontrado: ${id}`);
    }
  }
}

function toWorkspaceRecord(entity: WorkspaceEntity): WorkspaceRecord {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
  };
}

function toSystemRecord(entity: SystemEntity): SystemRecord {
  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    key: entity.key,
    name: entity.name,
    description: entity.description,
  };
}

function toSystemModuleRecord(entity: SystemModuleEntity): SystemModuleRecord {
  return {
    id: entity.id,
    systemId: entity.systemId,
    key: entity.key,
    name: entity.name,
    description: entity.description,
  };
}

function toActionRecord(entity: ActionEntity): ActionRecord {
  return {
    id: entity.id,
    moduleId: entity.moduleId,
    key: entity.key,
    name: entity.name,
    description: entity.description,
  };
}

function toAssetRecord(entity: AssetEntity): AssetRecord {
  return {
    id: entity.id,
    provider: entity.provider,
    kind: entity.kind,
    mimeType: entity.mimeType,
    fileName: entity.fileName,
    storagePath: entity.storagePath,
    publicUrl: entity.publicUrl,
    sizeBytes: entity.sizeBytes,
    createdAt: entity.createdAt.toISOString(),
  };
}

function toCaptureSessionRecord(entity: CaptureSessionEntity): CaptureSessionRecord {
  return {
    id: entity.id,
    actionId: entity.actionId,
    startedBy: entity.startedBy,
    status: entity.status,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toCaptureRecord(entity: CaptureEntity): CaptureRecord {
  return {
    id: entity.id,
    sessionId: entity.sessionId,
    selector: entity.selector,
    pageTitle: entity.pageTitle,
    pageUrl: entity.pageUrl,
    selectedElementTag: entity.selectedElementTag,
    textSnippet: entity.textSnippet,
    title: entity.title,
    description: entity.description,
    framing: entity.framing,
    status: entity.status,
    originalAssetId: entity.originalAssetId,
    contextAssetId: entity.contextAssetId,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toManualRecord(entity: ManualEntity): ManualRecord {
  if (entity.currentVersionId === null) {
    throw new NotFoundException(`Manual sin version actual configurada: ${entity.id}`);
  }

  return {
    id: entity.id,
    actionId: entity.actionId,
    title: entity.title,
    description: entity.description,
    status: entity.status,
    currentVersionId: entity.currentVersionId,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toManualVersionRecord(entity: ManualVersionEntity): ManualVersionRecord {
  return {
    id: entity.id,
    manualId: entity.manualId,
    versionLabel: entity.versionLabel,
    status: entity.status,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toManualStepRecord(entity: ManualStepEntity): ManualStepRecord {
  return {
    id: entity.id,
    versionId: entity.versionId,
    order: entity.order,
    title: entity.title,
    description: entity.description,
    selector: entity.selector,
    pageTitle: entity.pageTitle,
    pageUrl: entity.pageUrl,
    selectedElementTag: entity.selectedElementTag,
    textSnippet: entity.textSnippet,
    framing: entity.framing,
    assetId: entity.assetId,
    sourceCaptureId: entity.sourceCaptureId,
    createdAt: entity.createdAt.toISOString(),
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = value.replace(/\s+/g, ' ').trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeRequiredText(value: string, errorMessage: string): string {
  const normalizedValue = normalizeOptionalText(value);
  if (normalizedValue === null) {
    throw new ConflictException(errorMessage);
  }

  return normalizedValue;
}

function normalizeKey(value: string): string {
  const normalizedValue = normalizeOptionalText(value);
  if (normalizedValue === null) {
    throw new ConflictException('La clave generada no puede estar vacia.');
  }

  return normalizedValue
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function buildCaptureTitle(
  selectedElementTag: string,
  textSnippet: string | null,
  pageTitle: string,
): string {
  const snippet = normalizeOptionalText(textSnippet);
  if (snippet !== null) {
    return `Seleccionar ${snippet}`.slice(0, 180);
  }

  return `Captura ${selectedElementTag.toLowerCase()} en ${pageTitle}`.slice(0, 180);
}

function normalizePersistenceError(error: unknown, fallbackMessage: string): ConflictException {
  if (isUniqueViolation(error)) {
    return new ConflictException(fallbackMessage);
  }

  if (error instanceof ConflictException) {
    return error;
  }

  return new ConflictException(fallbackMessage);
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown };
  return candidate.code === '23505';
}
