/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('ComplianceController', () => {
  let controller: ComplianceController;
  let service: ComplianceService;

  const mockRuleSet = {
    id: 'TRS-123',
    country: 'NG',
    name: 'Test Rule Set',
    effectiveFrom: new Date('2026-01-01'),
    taxRules: [],
  };

  beforeEach(async () => {
    const builder = Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [
        {
          provide: ComplianceService,
          useValue: {
            findAllRuleSets: jest.fn().mockResolvedValue([mockRuleSet]),
            findRuleSetById: jest.fn().mockResolvedValue(mockRuleSet),
            createRuleSet: jest.fn().mockResolvedValue(mockRuleSet),
            updateRuleSet: jest.fn().mockResolvedValue(mockRuleSet),
            seedNta2026RuleSet: jest.fn().mockResolvedValue(mockRuleSet),
          },
        },
      ],
    });

    builder.overrideGuard(AuthGuard).useValue({ canActivate: () => true });
    builder.overrideGuard(RolesGuard).useValue({ canActivate: () => true });

    const module: TestingModule = await builder.compile();

    controller = module.get<ComplianceController>(ComplianceController);
    service = module.get<ComplianceService>(ComplianceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all rule sets', async () => {
    const res = await controller.findAllRuleSets('NG');
    expect(res).toEqual([mockRuleSet]);
    expect(service.findAllRuleSets).toHaveBeenCalledWith('NG');
  });

  it('should return a rule set by id', async () => {
    const res = await controller.findRuleSetById('TRS-123');
    expect(res).toEqual(mockRuleSet);
    expect(service.findRuleSetById).toHaveBeenCalledWith('TRS-123');
  });

  it('should seed NTA 2026 rule set', async () => {
    const res = await controller.seedNta2026();
    expect(res).toEqual(mockRuleSet);
    expect(service.seedNta2026RuleSet).toHaveBeenCalled();
  });
});
