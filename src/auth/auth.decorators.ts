import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types';

export const AUTH_ROLES_KEY = 'auth_roles';

export const RequireRoles = (...roles: string[]) =>
  SetMetadata(AUTH_ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
