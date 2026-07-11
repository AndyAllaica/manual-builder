import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { WorkspaceEntity } from './entities';

@Injectable()
export class DatabaseBootstrapService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const workspaceCount = await this.workspaceRepository.count();
    if (workspaceCount > 0) {
      return;
    }

    const workspace = this.workspaceRepository.create({
      id: randomUUID(),
      name: this.configService.get<string>('DEFAULT_WORKSPACE_NAME', 'Equipo Manual Builder'),
      description: this.configService.get<string>(
        'DEFAULT_WORKSPACE_DESCRIPTION',
        'Espacio de trabajo inicial para administrar sistemas, modulos, acciones y manuales de usuario.',
      ),
    });

    await this.workspaceRepository.save(workspace);
  }
}
