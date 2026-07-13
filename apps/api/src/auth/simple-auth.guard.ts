import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { type AuthenticatedRequest } from './auth.types';

@Injectable()
export class SimpleAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorizationHeader = request.headers.authorization;

    if (typeof authorizationHeader !== 'string') {
      throw new UnauthorizedException('Falta el token Bearer.');
    }

    request.user = await this.authService.authenticateAuthorizationHeader(authorizationHeader);
    return true;
  }
}
