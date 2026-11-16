import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { GatedFeature } from './domain/entitlements';
import { EntitlementsService } from './entitlements.service';
import { REQUIRED_ENTITLEMENT_KEY } from './entitlement.constants';

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<GatedFeature | undefined>(
      REQUIRED_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // No org context (e.g. platform admin): the route's own org check applies.
    if (!user?.organizationId) return true;

    await this.entitlements.assertFeature(user.organizationId, feature);
    return true;
  }
}
