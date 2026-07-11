import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CreateActionDto } from './dto/create-action.dto';
import { CreateSystemDto } from './dto/create-system.dto';
import { CreateSystemModuleDto } from './dto/create-system-module.dto';

@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('workspace')
  getWorkspaceOverview() {
    return this.catalogService.getWorkspaceOverview();
  }

  @Get('systems/:systemId')
  getSystemTree(@Param('systemId') systemId: string) {
    return this.catalogService.getSystemTree(systemId);
  }

  @Post('systems')
  createSystem(@Body() body: CreateSystemDto) {
    return this.catalogService.createSystem(body);
  }

  @Post('modules')
  createSystemModule(@Body() body: CreateSystemModuleDto) {
    return this.catalogService.createSystemModule(body);
  }

  @Post('actions')
  createAction(@Body() body: CreateActionDto) {
    return this.catalogService.createAction(body);
  }
}
