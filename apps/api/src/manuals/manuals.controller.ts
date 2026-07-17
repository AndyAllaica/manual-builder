import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { SimpleAuthGuard } from '../auth/simple-auth.guard';
import { type AuthenticatedUser } from '../auth/auth.types';
import { AddStepFromCaptureDto } from './dto/add-step-from-capture.dto';
import { CreateManualDto } from './dto/create-manual.dto';
import { ReorderManualStepsDto } from './dto/reorder-manual-steps.dto';
import { UpdateManualStepDto } from './dto/update-manual-step.dto';
import { ManualsService } from './manuals.service';

@Controller({ path: 'manuals', version: '1' })
@UseGuards(SimpleAuthGuard)
export class ManualsController {
  constructor(private readonly manualsService: ManualsService) {}

  @Post()
  createManual(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateManualDto,
  ) {
    return this.manualsService.createManual(user, body);
  }

  @Get('action/:actionId')
  listManualsByAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actionId') actionId: string,
  ) {
    return this.manualsService.listManualsByAction(user, actionId);
  }

  @Get(':manualId')
  getManual(
    @CurrentUser() user: AuthenticatedUser,
    @Param('manualId') manualId: string,
  ) {
    return this.manualsService.getManual(user, manualId);
  }

  @Post(':manualId/steps/from-capture')
  addStepFromCapture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('manualId') manualId: string,
    @Body() body: AddStepFromCaptureDto,
  ) {
    return this.manualsService.addStepFromCapture(user, manualId, body);
  }

  @Patch(':manualId/steps/order')
  reorderManualSteps(
    @CurrentUser() user: AuthenticatedUser,
    @Param('manualId') manualId: string,
    @Body() body: ReorderManualStepsDto,
  ) {
    return this.manualsService.reorderManualSteps(user, manualId, body);
  }

  @Patch('steps/:stepId')
  updateManualStep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
    @Body() body: UpdateManualStepDto,
  ) {
    return this.manualsService.updateManualStep(user, stepId, body);
  }

  @Delete('steps/:stepId')
  deleteManualStep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
  ) {
    return this.manualsService.deleteManualStep(user, stepId);
  }
}
