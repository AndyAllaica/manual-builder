import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
  UserEntity,
  WorkspaceMemberEntity,
  WorkspaceEntity,
} from '../database/entities';
import {
  type ActionRecord,
  type AddWorkspaceMemberInput,
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
  type CreateUserInput,
  type CreateWorkspaceInput,
  type DeleteManualStepResult,
  type ManualRecord,
  type ManualStepRecord,
  type ManualVersionRecord,
  type ReviewCaptureInput,
  type SystemModuleRecord,
  type SystemRecord,
  type UpdateManualStepInput,
  type UserRecord,
  type UserWithPasswordRecord,
  type WorkspaceMemberRecord,
  type WorkspaceMemberRole,
  type WorkspaceRecord,
} from '../domain/manual-builder.types';

@Injectable()
export class ManualBuilderRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly workspaceMemberRepository: Repository<WorkspaceMemberEntity>,
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

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const username = normalizeUsername(input.username);
    const displayName = normalizeOptionalText(input.displayName) ?? username;
    const user = this.userRepository.create({
      id: randomUUID(),
      username,
      displayName,
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      status: 'active',
    });

    try {
      await this.userRepository.save(user);

      if (await this.workspaceMemberRepository.count() === 0) {
        await this.assignExistingWorkspacesToOwner(user.id);
      }

      return toUserRecord(user);
    } catch (error) {
      throw normalizePersistenceError(error, 'Ya existe un usuario con ese nombre.');
    }
  }

  async findUserByUsername(username: string): Promise<UserWithPasswordRecord | null> {
    const user = await this.userRepository.findOneBy({ username: normalizeUsername(username) });
    return user === null ? null : toUserWithPasswordRecord(user);
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    const user = await this.userRepository.findOneBy({ id: userId });
    return user === null ? null : toUserRecord(user);
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    await this.ensureUserExists(input.ownerUserId);

    return this.dataSource.transaction(async (manager) => {
      const workspace = manager.create(WorkspaceEntity, {
        id: randomUUID(),
        name: normalizeRequiredText(input.name, 'El nombre del workspace es obligatorio.'),
        description: normalizeOptionalText(input.description) ?? '',
      });

      await manager.save(workspace);

      const membership = manager.create(WorkspaceMemberEntity, {
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: input.ownerUserId,
        role: 'owner',
      });

      await manager.save(membership);
      return toWorkspaceRecord(workspace);
    });
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceRecord[]> {
    const memberships = await this.workspaceMemberRepository.find({
      where: { userId },
      relations: { workspace: true },
      order: { createdAt: 'ASC' },
    });

    return memberships
      .filter((membership) => membership.workspace !== undefined)
      .map((membership) => toWorkspaceRecord(membership.workspace));
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    await this.ensureWorkspaceExists(workspaceId);

    const memberships = await this.workspaceMemberRepository.find({
      where: { workspaceId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });

    return memberships.map(toWorkspaceMemberRecord);
  }

  async addWorkspaceMember(workspaceId: string, input: AddWorkspaceMemberInput): Promise<WorkspaceMemberRecord> {
    await this.ensureWorkspaceExists(workspaceId);

    const user = await this.userRepository.findOneBy({ username: normalizeUsername(input.username) });
    if (user === null) {
      throw new NotFoundException(`Usuario no encontrado: ${input.username}`);
    }

    const existingMembership = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId: user.id },
      relations: { user: true },
    });

    if (existingMembership !== null) {
      existingMembership.role = input.role;
      await this.workspaceMemberRepository.save(existingMembership);
      return toWorkspaceMemberRecord(existingMembership);
    }

    const membership = this.workspaceMemberRepository.create({
      id: randomUUID(),
      workspaceId,
      userId: user.id,
      role: input.role,
      user,
    });

    try {
      await this.workspaceMemberRepository.save(membership);
      return toWorkspaceMemberRecord(membership);
    } catch (error) {
      throw normalizePersistenceError(error, 'El usuario ya pertenece a ese workspace.');
    }
  }

  async ensureUserCanAccessWorkspace(userId: string, workspaceId: string): Promise<void> {
    const membership = await this.findWorkspaceMembership(userId, workspaceId);
    if (membership === null) {
      throw new ForbiddenException('No tienes acceso a este workspace.');
    }
  }

  async ensureUserCanEditWorkspace(userId: string, workspaceId: string): Promise<void> {
    const membership = await this.findWorkspaceMembership(userId, workspaceId);
    if (membership === null || !canEditWorkspace(membership.role)) {
      throw new ForbiddenException('No tienes permisos para modificar este workspace.');
    }
  }

  async ensureUserCanManageWorkspace(userId: string, workspaceId: string): Promise<void> {
    const membership = await this.findWorkspaceMembership(userId, workspaceId);
    if (membership === null || !canManageWorkspace(membership.role)) {
      throw new ForbiddenException('Solo un owner o admin puede administrar miembros del workspace.');
    }
  }

  async getFirstWorkspaceForUser(userId: string): Promise<WorkspaceRecord> {
    const workspaces = await this.listWorkspacesForUser(userId);
    const firstWorkspace = workspaces[0] ?? null;
    if (firstWorkspace === null) {
      throw new NotFoundException('No tienes ningun workspace asignado. Crea uno o pide que te agreguen.');
    }

    return firstWorkspace;
  }

  async findWorkspaceById(workspaceId: string): Promise<WorkspaceRecord> {
    const workspace = await this.workspaceRepository.findOneBy({ id: workspaceId });
    if (workspace === null) {
      throw new NotFoundException(`Workspace no encontrado: ${workspaceId}`);
    }

    return toWorkspaceRecord(workspace);
  }

  async getWorkspace(): Promise<WorkspaceRecord> {
    const workspace = await this.workspaceRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });

    const firstWorkspace = workspace[0] ?? null;
    if (firstWorkspace === null) {
      throw new NotFoundException('No existe ningun espacio de trabajo configurado.');
    }

    return toWorkspaceRecord(firstWorkspace);
  }

  async listSystemsByWorkspaceId(workspaceId: string): Promise<SystemRecord[]> {
    const systems = await this.systemRepository.find({
      where: { workspaceId },
      order: { name: 'ASC' },
    });

    return systems.map(toSystemRecord);
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

      const previousContextAssetId = capture.contextAssetId;
      let nextContextAssetId = capture.contextAssetId;

      if (input.contextAsset !== null && input.contextAsset !== undefined) {
        const contextAsset = manager.create(AssetEntity, {
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
        nextContextAssetId = contextAsset.id;
      }

      capture.status = input.status;
      capture.title = normalizeOptionalText(input.title) ?? capture.title;
      capture.description = normalizeOptionalText(input.description) ?? capture.description;
      capture.framing = input.framing ?? capture.framing;
      capture.contextAssetId = nextContextAssetId;
      capture.updatedAt = new Date();

      await manager.save(capture);

      if (previousContextAssetId !== null && nextContextAssetId !== previousContextAssetId) {
        await manager.delete(AssetEntity, { id: previousContextAssetId });
      }

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
        expectedResult: normalizeOptionalText(input.expectedResult) ?? '',
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

  async updateManualStep(stepId: string, input: UpdateManualStepInput): Promise<ManualStepRecord> {
    return this.dataSource.transaction(async (manager) => {
      const step = await manager.findOne(ManualStepEntity, {
        where: { id: stepId },
      });

      if (step === null) {
        throw new NotFoundException(`Paso del manual no encontrado: ${stepId}`);
      }

      const version = await manager.findOne(ManualVersionEntity, {
        where: { id: step.versionId },
      });
      if (version === null) {
        throw new NotFoundException(`Version no encontrada: ${step.versionId}`);
      }

      const manual = await manager.findOne(ManualEntity, {
        where: { id: version.manualId },
      });
      if (manual === null) {
        throw new NotFoundException(`Manual no encontrado: ${version.manualId}`);
      }

      step.title = normalizeOptionalText(input.title) ?? step.title;
      step.description = normalizeOptionalText(input.description) ?? step.description;
      if (input.expectedResult !== undefined) {
        step.expectedResult = normalizeOptionalText(input.expectedResult) ?? '';
      }
      version.updatedAt = new Date();
      manual.updatedAt = new Date();

      await manager.save(step);
      await manager.save(version);
      await manager.save(manual);

      return toManualStepRecord(step);
    });
  }

  async deleteManualStep(stepId: string): Promise<DeleteManualStepResult> {
    return this.dataSource.transaction(async (manager) => {
      const step = await manager.findOne(ManualStepEntity, {
        where: { id: stepId },
      });

      if (step === null) {
        throw new NotFoundException(`Paso del manual no encontrado: ${stepId}`);
      }

      const version = await manager.findOne(ManualVersionEntity, {
        where: { id: step.versionId },
      });
      if (version === null) {
        throw new NotFoundException(`Version no encontrada: ${step.versionId}`);
      }

      const manual = await manager.findOne(ManualEntity, {
        where: { id: version.manualId },
      });
      if (manual === null) {
        throw new NotFoundException(`Manual no encontrado: ${version.manualId}`);
      }

      const deletedOrder = step.order;
      await manager.delete(ManualStepEntity, { id: step.id });

      const remainingSteps = await manager.find(ManualStepEntity, {
        where: { versionId: version.id },
        order: { order: 'ASC' },
      });

      for (const [index, remainingStep] of remainingSteps.entries()) {
        const nextOrder = index + 1;
        if (remainingStep.order === nextOrder) {
          continue;
        }

        remainingStep.order = nextOrder;
        await manager.save(remainingStep);
      }

      version.updatedAt = new Date();
      manual.updatedAt = new Date();
      await manager.save(version);
      await manager.save(manual);

      return {
        stepId: step.id,
        manualId: manual.id,
        versionId: version.id,
        deletedOrder,
        remainingStepCount: remainingSteps.length,
      };
    });
  }

  async getWorkspaceIdBySystemId(systemId: string): Promise<string> {
    const system = await this.findSystemById(systemId);
    return system.workspaceId;
  }

  async getWorkspaceIdBySystemModuleId(moduleId: string): Promise<string> {
    const systemModule = await this.findSystemModuleById(moduleId);
    return this.getWorkspaceIdBySystemId(systemModule.systemId);
  }

  async getWorkspaceIdByActionId(actionId: string): Promise<string> {
    const action = await this.findActionById(actionId);
    return this.getWorkspaceIdBySystemModuleId(action.moduleId);
  }

  async getWorkspaceIdByManualId(manualId: string): Promise<string> {
    const manual = await this.findManualById(manualId);
    return this.getWorkspaceIdByActionId(manual.actionId);
  }

  async getWorkspaceIdByManualStepId(stepId: string): Promise<string> {
    const step = await this.manualStepRepository.findOneBy({ id: stepId });
    if (step === null) {
      throw new NotFoundException(`Paso del manual no encontrado: ${stepId}`);
    }

    const version = await this.findManualVersionById(step.versionId);
    return this.getWorkspaceIdByManualId(version.manualId);
  }

  async getWorkspaceIdByCaptureSessionId(sessionId: string): Promise<string> {
    const session = await this.findCaptureSessionById(sessionId);
    return this.getWorkspaceIdByActionId(session.actionId);
  }

  async getWorkspaceIdByCaptureId(captureId: string): Promise<string> {
    const capture = await this.findCaptureById(captureId);
    return this.getWorkspaceIdByCaptureSessionId(capture.sessionId);
  }

  async listCaptureSessionsForUser(userId: string): Promise<CaptureSessionRecord[]> {
    const workspaceIds = (await this.listWorkspacesForUser(userId)).map((workspace) => workspace.id);
    if (workspaceIds.length === 0) {
      return [];
    }

    const sessions = await this.captureSessionRepository
      .createQueryBuilder('session')
      .innerJoin(ActionEntity, 'action', 'action.id = session.action_id')
      .innerJoin(SystemModuleEntity, 'module', 'module.id = action.module_id')
      .innerJoin(SystemEntity, 'system', 'system.id = module.system_id')
      .where('system.workspace_id IN (:...workspaceIds)', { workspaceIds })
      .orderBy('session.updated_at', 'DESC')
      .getMany();

    return sessions.map(toCaptureSessionRecord);
  }

  private async ensureWorkspaceExists(workspaceId: string): Promise<void> {
    await this.ensureEntityExists(this.workspaceRepository, workspaceId, 'Workspace');
  }

  private async ensureUserExists(userId: string): Promise<void> {
    await this.ensureEntityExists(this.userRepository, userId, 'Usuario');
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

  private async findWorkspaceMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMemberEntity | null> {
    return this.workspaceMemberRepository.findOneBy({ userId, workspaceId });
  }

  private async assignExistingWorkspacesToOwner(userId: string): Promise<void> {
    const workspaces = await this.workspaceRepository.find({
      order: { createdAt: 'ASC' },
    });

    for (const workspace of workspaces) {
      const membershipCount = await this.workspaceMemberRepository.count({
        where: { workspaceId: workspace.id },
      });

      if (membershipCount > 0) {
        continue;
      }

      await this.workspaceMemberRepository.save(this.workspaceMemberRepository.create({
        id: randomUUID(),
        workspaceId: workspace.id,
        userId,
        role: 'owner',
      }));
    }
  }
}

function toUserRecord(entity: UserEntity): UserRecord {
  return {
    id: entity.id,
    username: entity.username,
    displayName: entity.displayName,
    email: entity.email,
    status: entity.status,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toUserWithPasswordRecord(entity: UserEntity): UserWithPasswordRecord {
  return {
    ...toUserRecord(entity),
    passwordHash: entity.passwordHash,
  };
}

function toWorkspaceRecord(entity: WorkspaceEntity): WorkspaceRecord {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
  };
}

function toWorkspaceMemberRecord(entity: WorkspaceMemberEntity): WorkspaceMemberRecord {
  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    userId: entity.userId,
    username: entity.user?.username ?? '',
    displayName: entity.user?.displayName ?? '',
    role: entity.role,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
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
    expectedResult: entity.expectedResult,
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

function normalizeUsername(value: string): string {
  const normalizedValue = normalizeOptionalText(value);
  if (normalizedValue === null) {
    throw new ConflictException('El nombre de usuario es obligatorio.');
  }

  return normalizedValue.toLowerCase();
}

function normalizeEmail(value: string | null | undefined): string | null {
  return normalizeOptionalText(value)?.toLowerCase() ?? null;
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

function canEditWorkspace(role: WorkspaceMemberRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function canManageWorkspace(role: WorkspaceMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}
