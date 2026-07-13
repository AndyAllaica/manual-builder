import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { type AuthenticatedRequest, type AuthenticatedUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user === undefined) {
      throw new UnauthorizedException('Sesion no autenticada.');
    }

    return request.user;
  },
);
