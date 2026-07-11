import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CaptureSessionsService } from './capture-sessions.service';
import { CreateCaptureDto } from './dto/create-capture.dto';
import { CreateCaptureSessionDto } from './dto/create-capture-session.dto';
import { ReviewCaptureDto } from './dto/review-capture.dto';

@Controller({ path: 'capture-sessions', version: '1' })
export class CaptureSessionsController {
  constructor(private readonly captureSessionsService: CaptureSessionsService) {}

  @Get()
  listCaptureSessions(@Query('actionId') actionId?: string) {
    return this.captureSessionsService.listCaptureSessions(actionId);
  }

  @Get(':sessionId')
  getCaptureSession(@Param('sessionId') sessionId: string) {
    return this.captureSessionsService.getCaptureSession(sessionId);
  }

  @Post()
  createCaptureSession(@Body() body: CreateCaptureSessionDto) {
    return this.captureSessionsService.createCaptureSession(body);
  }

  @Post(':sessionId/captures')
  createCapture(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateCaptureDto,
  ) {
    return this.captureSessionsService.createCapture(sessionId, {
      selector: body.selector,
      pageTitle: body.pageTitle,
      pageUrl: body.pageUrl,
      selectedElementTag: body.selectedElementTag,
      textSnippet: body.textSnippet ?? null,
      title: body.title,
      description: body.description,
      framing: body.framing ?? 'context',
      originalImageDataUrl: body.originalImageDataUrl,
      contextImageDataUrl: body.contextImageDataUrl ?? null,
    });
  }

  @Patch('captures/:captureId')
  reviewCapture(
    @Param('captureId') captureId: string,
    @Body() body: ReviewCaptureDto,
  ) {
    return this.captureSessionsService.reviewCapture(captureId, body);
  }
}
