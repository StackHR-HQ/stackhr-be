import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ROLES_KEY } from './auth.decorators';
import { USER_ROLES, USER_TYPES } from './auth.constants';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      AUTH_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user || !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    const isPlatformAdminRoleRequired = requiredRoles.some(
      (r) => r === USER_ROLES.STACKHR_ADMIN || r === USER_ROLES.STACKHR_SUPPORT,
    );
    if (
      isPlatformAdminRoleRequired &&
      request.user.userType !== USER_TYPES.STACKHR_ADMIN
    ) {
      throw new ForbiddenException(
        'Platform administrator privileges require a platform administrator account',
      );
    }

    return true;
  }
}
