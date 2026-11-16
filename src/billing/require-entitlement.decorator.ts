import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import type { GatedFeature } from './domain/entitlements';
import { EntitlementGuard } from './entitlement.guard';
import { REQUIRED_ENTITLEMENT_KEY } from './entitlement.constants';

export { REQUIRED_ENTITLEMENT_KEY };

/**
 * Gate a route on the org's plan. Apply after the class-level
 * `@UseGuards(AuthGuard, RolesGuard)` so `request.user` is populated;
 * method guards run after class guards. Blocked requests get 402.
 */
export const RequireEntitlement = (feature: GatedFeature) =>
  applyDecorators(
    SetMetadata(REQUIRED_ENTITLEMENT_KEY, feature),
    UseGuards(EntitlementGuard),
  );
