import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AddStepFromCaptureDto } from './dto/add-step-from-capture.dto';
import { CreateManualDto } from './dto/create-manual.dto';
import { ManualsService } from './manuals.service';

@Controller({ path: 'manuals', version: '1' })
export class ManualsController {
  constructor(private readonly manualsService: ManualsService) {}

  @Post()
  createManual(@Body() body: CreateManualDto) {
    return this.manualsService.createManual(body);
  }

  @Get('action/:actionId')
  listManualsByAction(@Param('actionId') actionId: string) {
    return this.manualsService.listManualsByAction(actionId);
  }

  @Get(':manualId')
  getManual(@Param('manualId') manualId: string) {
    return this.manualsService.getManual(manualId);
  }

  @Post(':manualId/steps/from-capture')
  addStepFromCapture(
    @Param('manualId') manualId: string,
    @Body() body: AddStepFromCaptureDto,
  ) {
    return this.manualsService.addStepFromCapture(manualId, body);
  }
}
