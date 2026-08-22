import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.authService.getTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    const user = await this.authService.validateSession(token);

    if (!user) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    request.user = user;
    return true;
  }
}
