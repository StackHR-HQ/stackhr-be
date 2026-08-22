import { Test, TestingModule } from '@nestjs/testing';
import { StackhrAdminService } from './stackhr-admin.service';

describe('StackhrAdminService', () => {
  let service: StackhrAdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StackhrAdminService],
    }).compile();

    service = module.get<StackhrAdminService>(StackhrAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
