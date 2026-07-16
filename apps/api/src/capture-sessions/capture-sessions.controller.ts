import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { SimpleAuthGuard } from '../auth/simple-auth.guard';
import { type AuthenticatedUser } from '../auth/auth.types';
import { CaptureSessionsService } from './capture-sessions.service';
import { CreateCaptureDto } from './dto/create-capture.dto';
import { CreateCaptureSessionDto } from './dto/create-capture-session.dto';
import { ReviewCaptureDto } from './dto/review-capture.dto';

@Controller({ path: 'capture-sessions', version: '1' })
@UseGuards(SimpleAuthGuard)
export class CaptureSessionsController {
  constructor(private readonly captureSessionsService: CaptureSessionsService) {}

  @Get()
  listCaptureSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('actionId') actionId?: string,
  ) {
    return this.captureSessionsService.listCaptureSessions(user, actionId);
  }

  @Get(':sessionId')
  getCaptureSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.captureSessionsService.getCaptureSession(user, sessionId);
  }

  @Post()
  createCaptureSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCaptureSessionDto,
  ) {
    return this.captureSessionsService.createCaptureSession(user, body);
  }

  @Post(':sessionId/captures')
  createCapture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() body: CreateCaptureDto,
  ) {
    return this.captureSessionsService.createCapture(user, sessionId, {
      selector: body.selector,
      pageTitle: body.pageTitle,
      pageUrl: body.pageUrl,
      selectedElementTag: body.selectedElementTag,
      textSnippet: body.textSnippet ?? null,
      title: body.title,
      description: body.description,
      framing: body.framing ?? 'full',
      selectionRect: body.selectionRect ?? null,
      viewport: body.viewport ?? null,
      captureTarget: body.captureTarget ?? 'element',
      originalImageDataUrl: body.originalImageDataUrl,
      contextImageDataUrl: body.contextImageDataUrl ?? null,
    });
  }

  @Patch('captures/:captureId')
  reviewCapture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('captureId') captureId: string,
    @Body() body: ReviewCaptureDto,
  ) {
    return this.captureSessionsService.reviewCapture(user, captureId, {
      status: body.status,
      title: body.title,
      description: body.description,
      framing: body.framing,
      contextImageDataUrl: body.contextImageDataUrl ?? null,
    });
  }
}
