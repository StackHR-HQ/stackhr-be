import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementGuard } from './entitlement.guard';
import { RequireEntitlement } from './require-entitlement.decorator';
import { PlanUpgradeRequiredException } from './plan-upgrade-required.exception';

class FakeController {
  @RequireEntitlement('payroll')
  runPayroll() {}

  listThings() {}
}

function contextFor(handler: keyof FakeController, organizationId = 'org-1') {
  return {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- only read as a metadata key
    getHandler: () => FakeController.prototype[handler],
    getClass: () => FakeController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u1', organizationId } }),
    }),
  } as unknown as ExecutionContext;
}

describe('EntitlementGuard', () => {
  let entitlements: { assertFeature: jest.Mock };
  let guard: EntitlementGuard;

  beforeEach(() => {
    entitlements = { assertFeature: jest.fn().mockResolvedValue(undefined) };
    guard = new EntitlementGuard(new Reflector(), entitlements as any);
  });

  it('lets an entitled org through to a gated route', async () => {
    await expect(guard.canActivate(contextFor('runPayroll'))).resolves.toBe(
      true,
    );
    expect(entitlements.assertFeature).toHaveBeenCalledWith('org-1', 'payroll');
  });

  it('rejects an org without the feature with 402 PLAN_UPGRADE_REQUIRED', async () => {
    entitlements.assertFeature.mockRejectedValue(
      new PlanUpgradeRequiredException('Payroll is not included', {
        feature: 'payroll',
        currentPlan: 'FREE',
        requiredPlan: 'STARTER',
      }),
    );

    const error = await guard
      .canActivate(contextFor('runPayroll'))
      .catch((e) => e);

    expect(error).toBeInstanceOf(PlanUpgradeRequiredException);
    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
  });

  it('does nothing on routes without @RequireEntitlement', async () => {
    await expect(guard.canActivate(contextFor('listThings'))).resolves.toBe(
      true,
    );
    expect(entitlements.assertFeature).not.toHaveBeenCalled();
  });
});
