/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { TenantComplianceController } from './tenant-compliance.controller';
import { ComplianceService } from './compliance.service';
import { AuthGuard } from '../auth/auth.guard';

describe('TenantComplianceController', () => {
  let controller: TenantComplianceController;
  let service: jest.Mocked<ComplianceService>;

  beforeEach(async () => {
    service = {
      getEffectiveTaxRuleSet: jest.fn(),
    } as unknown as jest.Mocked<ComplianceService>;

    const builder = Test.createTestingModule({
      controllers: [TenantComplianceController],
      providers: [
        {
          provide: ComplianceService,
          useValue: service,
        },
      ],
    });

    builder.overrideGuard(AuthGuard).useValue({ canActivate: () => true });

    const module: TestingModule = await builder.compile();

    controller = module.get<TenantComplianceController>(
      TenantComplianceController,
    );
  });

  it('should return effective tax rule set for active tenant', async () => {
    const mockRuleSet = {
      id: 'rule-set-1',
      country: 'NG',
      name: 'Nigeria Tax Act 2026',
    };
    service.getEffectiveTaxRuleSet.mockResolvedValue(mockRuleSet as any);

    const result = await controller.getActiveRuleSet('NG');
    expect(result).toEqual(mockRuleSet);
    expect(service.getEffectiveTaxRuleSet).toHaveBeenCalledWith('NG');
  });
});
