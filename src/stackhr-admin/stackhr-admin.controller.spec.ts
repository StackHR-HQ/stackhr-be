import { Test, TestingModule } from '@nestjs/testing';
import { StackhrAdminController } from './stackhr-admin.controller';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('StackhrAdminController', () => {
  let controller: StackhrAdminController;

  beforeEach(async () => {
    const builder = Test.createTestingModule({
      controllers: [StackhrAdminController],
    });

    builder.overrideGuard(AuthGuard).useValue({});
    builder.overrideGuard(RolesGuard).useValue({});
    const module: TestingModule = await builder.compile();

    controller = module.get<StackhrAdminController>(StackhrAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
