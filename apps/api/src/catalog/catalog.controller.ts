import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { SimpleAuthGuard } from '../auth/simple-auth.guard';
import { type AuthenticatedUser } from '../auth/auth.types';
import { CatalogService } from './catalog.service';
import { CreateActionDto } from './dto/create-action.dto';
import { CreateSystemDto } from './dto/create-system.dto';
import { CreateSystemModuleDto } from './dto/create-system-module.dto';

@Controller({ path: 'catalog', version: '1' })
@UseGuards(SimpleAuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('workspace')
  getWorkspaceOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogService.getWorkspaceOverview(user);
  }

  @Get('workspaces/:workspaceId')
  getWorkspaceOverviewById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.catalogService.getWorkspaceOverviewById(user, workspaceId);
  }

  @Get('systems/:systemId')
  getSystemTree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('systemId') systemId: string,
  ) {
    return this.catalogService.getSystemTree(user, systemId);
  }

  @Post('systems')
  createSystem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateSystemDto,
  ) {
    return this.catalogService.createSystem(user, body);
  }

  @Post('modules')
  createSystemModule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateSystemModuleDto,
  ) {
    return this.catalogService.createSystemModule(user, body);
  }

  @Post('actions')
  createAction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateActionDto,
  ) {
    return this.catalogService.createAction(user, body);
  }
}
