import { Test, TestingModule } from '@nestjs/testing';
import { StackhrAdminController } from './stackhr-admin.controller';

describe('StackhrAdminController', () => {
  let controller: StackhrAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StackhrAdminController],
    }).compile();

    controller = module.get<StackhrAdminController>(StackhrAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
